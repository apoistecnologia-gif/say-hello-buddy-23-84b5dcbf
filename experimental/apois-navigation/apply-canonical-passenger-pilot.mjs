// Only the disposable canonical Corridas workspace, AFTER its official hardeners.
import assert from 'node:assert/strict'
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs'
import {join,dirname} from 'node:path'
const temp=realpathSync(process.env.RUNNER_TEMP)
const target=realpathSync(process.argv[2]),source=realpathSync(process.argv[3])
assert.ok(target.startsWith(temp+'/apois-private-superapp-')&&target.endsWith('/canonical/.work/corridas'))
assert.ok(source.startsWith(temp+'/apois-modern-passenger-')&&source.endsWith('/workspace'))
const paths=['experimental/apois-navigation/ui','src/components/navigation/PassengerNavigationPilot.tsx','src/components/navigation/pilot-config.ts','src/components/navigation/pilot-runtime.ts','src/services/navigation/independent-selection.ts']
for(const path of paths){
 const dst=join(target,path);assert.ok(!existsSync(dst),'would overwrite protected canonical source '+path)
 mkdirSync(dirname(dst),{recursive:true})
 cpSync(join(source,path),dst,{recursive:true,force:false,errorOnExist:true})
}
const config=readFileSync(join(target,'src/components/navigation/pilot-config.ts'),'utf8')
assert.ok(config.includes('PILOT_INSTALLED:boolean=false')&&config.includes('NEW_SELECTION_ENABLED:boolean=false'))
const exact=(s,a,b)=>{assert.equal(s.split(a).length,2,'canonical anchor: '+a);return s.replace(a,()=>b)}
const patch=(path,transform)=>{const full=join(target,path);const before=readFileSync(full,'utf8');writeFileSync(full,transform(before))}
const guard='import { withPilotCreation } from "@/components/navigation/pilot-runtime";'
const auth='import { supabase } from "@/integrations/supabase/client";'
patch('src/routes/_authenticated.tsx',s=>{
 s=exact(s,'import { usePushNotifications } from "@/hooks/use-push-notifications";','import { usePushNotifications } from "@/hooks/use-push-notifications";\nimport { PassengerNavigationPilot } from "@/components/navigation/PassengerNavigationPilot";')
 return exact(s,'<Outlet />','<PassengerNavigationPilot />\n                                    <Outlet />')
})
patch('src/hooks/rides/use-ride-request.tsx',s=>{
 s=exact(s,auth,auth+'\n'+guard)
 return exact(s,'        const { data, error } = await supabase.functions.invoke("request-ride", {\n          body: payload,\n        });','        const { data, error } = await withPilotCreation((headers) => supabase.functions.invoke("request-ride", {\n          body: payload,\n          ...(headers ? { headers } : {}),\n        }), user.id);')
})
patch('src/services/rides/ride-request-service.ts',s=>{
 s=exact(s,auth,auth+'\n'+guard)
 return exact(s,'      const { data, error } = await supabase.functions.invoke("request-ride", {\n        body: payload,\n      });','      const { data, error } = await withPilotCreation((headers) => supabase.functions.invoke("request-ride", {\n        body: payload,\n        ...(headers ? { headers } : {}),\n      }));')
})
console.log('APOIS_CANONICAL_PRIVATE_OVERLAY_READY flags=false')
