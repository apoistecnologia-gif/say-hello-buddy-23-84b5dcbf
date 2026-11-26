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
// The modern hook has asynchronous native watcher registration. Permission
// changes may rerun the effect before the registration promise resolves.
// Serialize cleanup and registration, and scope callbacks to the effect.
patch('src/hooks/use-location.tsx',s=>{
 s=exact(s,'  const watchIdRef = useRef<string | null>(null);','  const watchIdRef = useRef<string | null>(null);\n  const watchOperationRef = useRef<Promise<void>>(Promise.resolve());')
 const begin='  useEffect(() => {\n    mountedRef.current = true;\n\n    const start = async () => {'
 const end='  }, [checkPermissions, permissionState, refreshLocation, requestPermission, updateLocationState]);'
 assert.equal(s.split(begin).length,2);assert.equal(s.split(end).length,2)
 let effect=s.slice(s.indexOf(begin),s.indexOf(end)+end.length)
 const old=effect
 effect=exact(effect,'    mountedRef.current = true;\n\n    const start = async () => {','    mountedRef.current = true;\n    let active = true;\n    const current = () => active && mountedRef.current;\n    const clear = async () => {\n      const id = watchIdRef.current;\n      if (!id) return;\n      await Geolocation.clearWatch({ id });\n      if (watchIdRef.current === id) watchIdRef.current = null;\n    };\n    const queue = (work: () => Promise<void>) => {\n      watchOperationRef.current = watchOperationRef.current.then(work).catch((error) => {\n        console.warn("[LocationProvider] Watch lifecycle unavailable", error);\n      });\n    };\n\n    const start = async () => {\n      if (!current()) return;\n      await clear();\n      if (!current()) return;')
 effect=effect.replaceAll('if (!mountedRef.current)', 'if (!current())')
 effect=exact(effect,'if (!mountedRef.current || permission !== "granted")','if (!current() || permission !== "granted")')
 effect=exact(effect,'        watchIdRef.current = await Geolocation.watchPosition(','        const id = await Geolocation.watchPosition(')
 effect=exact(effect,'        );\n      } catch (watchError) {','        );\n        watchIdRef.current = id;\n        if (!current()) await clear();\n      } catch (watchError) {')
 effect=exact(effect,'    void start();\n\n    return () => {\n      mountedRef.current = false;\n      const watchId = watchIdRef.current;\n      watchIdRef.current = null;\n      if (watchId) void Geolocation.clearWatch({ id: watchId });\n    };','    queue(start);\n\n    return () => {\n      active = false;\n      mountedRef.current = false;\n      queue(clear);\n    };')
 return exact(s,old,effect)
})
// The pinned canonical hardeners generate two type errors against the
// modern dependency/tsconfig versions. Preserve OAuth behavior and layout.
patch('src/components/auth/PassengerGoogleLoginButton.tsx',s=>exact(s,
 'import { App, type PluginListenerHandle } from "@capacitor/app";\nimport { Capacitor } from "@capacitor/core";',
 'import { App } from "@capacitor/app";\nimport { Capacitor, type PluginListenerHandle } from "@capacitor/core";'))
patch('src/components/rides/active/SearchingDriverScreen.tsx',s=>{
 assert.ok(s.includes('APOIS_SEARCHING_DRIVER_PREMIUM_V1'))
 return exact(s,')[0].trim();',')[0]?.trim() || "Endereço não informado";')
})
console.log('APOIS_CANONICAL_PRIVATE_OVERLAY_READY flags=false')
