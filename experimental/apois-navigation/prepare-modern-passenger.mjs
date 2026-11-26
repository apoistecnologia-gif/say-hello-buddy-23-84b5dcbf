// Private, disposable integration rehearsal for the newer Passenger source.
// Requires both exact commits in an already-authorized local repository.
// No clone/fetch, dependency installation, build, deployment or source edits.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,rmSync,existsSync} from 'node:fs'
import {join,dirname} from 'node:path'
const modern="b6b87f02066ef62a8d201ef63a3152bb2364f5cd",pilot="e322fc53c201ba8941dfdeb5025b788c47e9baad"
const inputs=[
  {
    "path": "experimental/apois-navigation/ui/DURABLE-RECOVERY.md",
    "sha": "b37ab0b531f1f6148516e919fcda6fab611acdea"
  },
  {
    "path": "experimental/apois-navigation/ui/HOST-TRANSPORT.md",
    "sha": "8905d1caebd1276526e25bc54e40772d081f7a54"
  },
  {
    "path": "experimental/apois-navigation/ui/README.md",
    "sha": "1433503ba5830b499706df39b1c60413035ffc5e"
  },
  {
    "path": "experimental/apois-navigation/ui/REQUEST-REVIEW.md",
    "sha": "20b60174500de6e29295637761590379f8f8aa9e"
  },
  {
    "path": "experimental/apois-navigation/ui/approved-map-provider.d.mts",
    "sha": "bc8606680bace7c0c09463948f5e91a0512d0f69"
  },
  {
    "path": "experimental/apois-navigation/ui/approved-map-provider.mjs",
    "sha": "ad0fdf2c274bc3121b22471d18206c082fc707ef"
  },
  {
    "path": "experimental/apois-navigation/ui/approved-map-provider.test.mjs",
    "sha": "a037430e0e0e49c3e6fdc9d3f6247a6064489fa8"
  },
  {
    "path": "experimental/apois-navigation/ui/catalog-validation.mjs",
    "sha": "563a36c56ff692145ec72884e97addce4cca7349"
  },
  {
    "path": "experimental/apois-navigation/ui/creation-interlock.mjs",
    "sha": "39e32d36eebab72d8394c963b26bb3e743658fe9"
  },
  {
    "path": "experimental/apois-navigation/ui/durable-passenger-view.d.mts",
    "sha": "7771cbe2b0434a606daf8d9f4740fdebc58b3ffa"
  },
  {
    "path": "experimental/apois-navigation/ui/durable-passenger-view.mjs",
    "sha": "a9623f68da1aea91176cf2b83155b689b1ebdb5c"
  },
  {
    "path": "experimental/apois-navigation/ui/durable-ride-host.mjs",
    "sha": "cea2272d0c94f9f5c0cbb30a22c76e206492cf4e"
  },
  {
    "path": "experimental/apois-navigation/ui/durable-ride-host.test.mjs",
    "sha": "8ab0e3fafd7c9f6cd2654d13cf2a8d3e2fe4660e"
  },
  {
    "path": "experimental/apois-navigation/ui/local-map.mjs",
    "sha": "48dc4a7468a278f46302a3f0bb695dcb9d0cf539"
  },
  {
    "path": "experimental/apois-navigation/ui/map-selection.mjs",
    "sha": "a4f7019ac1c08de2ec2c35075a0ce80dfa0a7c51"
  },
  {
    "path": "experimental/apois-navigation/ui/passenger-flow.mjs",
    "sha": "bc89cb6598b2676049da9aa3642a8403f5e6be5d"
  },
  {
    "path": "experimental/apois-navigation/ui/passenger-panel-view.mjs",
    "sha": "ab7c3394985a8fe81e48f47ade913b85cebed94d"
  },
  {
    "path": "experimental/apois-navigation/ui/passenger-panel.mjs",
    "sha": "87c9129ce603e1a76bda723f46633625dcca7a42"
  },
  {
    "path": "experimental/apois-navigation/ui/passenger-panel.test.mjs",
    "sha": "e4d91d93c0ed08d587f157642d10364f08ded7f6"
  },
  {
    "path": "experimental/apois-navigation/ui/pilot-runtime.d.mts",
    "sha": "59ec00406abcd37c01e6622c95bf0f9c8cbb438a"
  },
  {
    "path": "experimental/apois-navigation/ui/pilot-runtime.mjs",
    "sha": "a692cd04d2dc5eb666868749ec6c6aea351783a6"
  },
  {
    "path": "experimental/apois-navigation/ui/pilot-runtime.test.mjs",
    "sha": "eff3a8999d2ede35f63ce01c59055559398b60a1"
  },
  {
    "path": "experimental/apois-navigation/ui/request-review.mjs",
    "sha": "c42bbe9032342f6ec51dce831192392b9ed59042"
  },
  {
    "path": "experimental/apois-navigation/ui/request-review.test.mjs",
    "sha": "91f41f95fb24f0c4512fbcdf8f2e976f86f3c173"
  },
  {
    "path": "experimental/apois-navigation/ui/ride-journal.browser.html",
    "sha": "a82d0457a24c93e680cfd9917a5b41fb3f298787"
  },
  {
    "path": "experimental/apois-navigation/ui/ride-journal.browser.mjs",
    "sha": "a04d90a0b5ae0a21ca52b301cd67267561e35917"
  },
  {
    "path": "experimental/apois-navigation/ui/ride-journal.mjs",
    "sha": "7c9a05e8f892925742cec0d3bdb12c95bedd3228"
  },
  {
    "path": "experimental/apois-navigation/ui/search.mjs",
    "sha": "aede4d05216ddb92a7b06838e64a6b7b684df3c1"
  },
  {
    "path": "experimental/apois-navigation/ui/verified-host-transport.mjs",
    "sha": "a9a85805af9ceecb3b6a117047168795bad8f067"
  },
  {
    "path": "experimental/apois-navigation/ui/verified-host-transport.test.mjs",
    "sha": "f77f019168355b5ead5abe89458e0c1d2416a39c"
  },
  {
    "path": "src/components/navigation/PassengerNavigationPilot.tsx",
    "sha": "3f6378882571d75632059c05e38b0630dc1c3a08"
  },
  {
    "path": "src/components/navigation/pilot-config.ts",
    "sha": "95176420007841cb885c5e1ad09fe7be796233ff"
  },
  {
    "path": "src/components/navigation/pilot-runtime.ts",
    "sha": "1255fa43e8add11dc9cf4a814734c62870496fdd"
  },
  {
    "path": "src/services/navigation/independent-selection.ts",
    "sha": "b963b97a43d8610a3f9e6b62b47edad3ca37a8dd"
  }
]
const repo=realpathSync(process.argv[2]),temp=realpathSync(process.env.RUNNER_TEMP)
assert.ok(temp!=='/'&&temp!==repo,'expected disposable RUNNER_TEMP')
const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:32*1024*1024}).trimEnd()
for(const ref of [modern,pilot])assert.equal(git('rev-parse',ref+'^{commit}'),ref)
const before=git('rev-parse','HEAD'),status=git('status','--porcelain')
assert.ok(!git('ls-tree','-r',modern).split('\n').some(l=>/^(120000|160000) /.test(l)),'unsafe archive entry')
const root=mkdtempSync(join(temp,'apois-modern-passenger-')),workspace=join(root,'workspace'),archive=join(root,'source.tar')
const exact=(source,anchor,replacement)=>{assert.equal(source.split(anchor).length,2,'protected anchor');return source.replace(anchor,()=>replacement)}
const read=p=>readFileSync(join(workspace,p),'utf8')
const patch=(p,hash,transform)=>{
 assert.equal(git('rev-parse',modern+':'+p),hash)
 const path=join(workspace,p)
 assert.equal(execFileSync('git',['hash-object',path],{encoding:'utf8'}).trim(),hash)
 writeFileSync(path,transform(read(p)))
}
try{
 mkdirSync(workspace)
 execFileSync('git',['-C',repo,'archive','--format=tar','--output='+archive,modern])
 execFileSync('tar',['-xf',archive,'-C',workspace])
 rmSync(archive)
 for(const {path,sha} of inputs){
  assert.equal(git('rev-parse',pilot+':'+path),sha)
  const target=join(workspace,path)
  assert.ok(!existsSync(target),'would overwrite protected source '+path)
  mkdirSync(dirname(target),{recursive:true})
  writeFileSync(target,execFileSync('git',['-C',repo,'show',pilot+':'+path],{maxBuffer:8*1024*1024}),{flag:'wx'})
  assert.equal(execFileSync('git',['hash-object',target],{encoding:'utf8'}).trim(),sha)
 }
 const guardImport='import { withPilotCreation } from "@/components/navigation/pilot-runtime";'
 const supabaseImport='import { supabase } from "@/integrations/supabase/client";'
 patch('src/routes/_authenticated.tsx','c30996fdb0f8584103c51e3d7aa7710dc46cbf2e',s=>{
  s=exact(s,'import { usePushNotifications } from "@/hooks/use-push-notifications";','import { usePushNotifications } from "@/hooks/use-push-notifications";\nimport { PassengerNavigationPilot } from "@/components/navigation/PassengerNavigationPilot";')
  return exact(s,'                                    <Outlet />','                                    <PassengerNavigationPilot />\n                                    <Outlet />')
 })
 patch('src/hooks/rides/use-ride-request.tsx','9a6e6c67fd6d416c44b72204f90bb0989e073d65',s=>{
  s=exact(s,supabaseImport,supabaseImport+'\n'+guardImport)
  // Match the protected Superapp prepare-workspace routing adaptation.
  // Original payload, identity and cancellation remain unchanged; only the
  // disposable creation call is routed through request-ride.
  return exact(s,'        const { data, error } = await supabase.functions.invoke("passenger-ride-request", {\n          body: payload,\n        });','        const { data, error } = await withPilotCreation((headers) => supabase.functions.invoke("request-ride", {\n          body: payload,\n          ...(headers ? { headers } : {}),\n        }), user.id);')
 })
 patch('src/services/rides/ride-request-service.ts','19c596d1a4221b1b0016c99001bb7128dc83cd90',s=>{
  s=exact(s,supabaseImport,supabaseImport+'\n'+guardImport)
  return exact(s,'      const { data, error } = await supabase.functions.invoke("request-ride", {\n        body: payload,\n      });','      const { data, error } = await withPilotCreation((headers) => supabase.functions.invoke("request-ride", {\n        body: payload,\n        ...(headers ? { headers } : {}),\n      }));')
 })
 const config=read('src/components/navigation/pilot-config.ts')
 assert.ok(config.includes('PILOT_INSTALLED:boolean=false')&&config.includes('NEW_SELECTION_ENABLED:boolean=false'))
 assert.equal(git('rev-parse','HEAD'),before);assert.equal(git('status','--porcelain'),status)
 console.log('APOIS_MODERN_PASSENGER_WORKSPACE_READY',JSON.stringify({workspace,modern,pilot,files:inputs.length+3,installed:false,sourceUnchanged:true}))
}catch(e){rmSync(root,{recursive:true,force:true});throw e}
