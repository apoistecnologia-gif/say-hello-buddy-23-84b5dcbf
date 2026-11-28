import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
test('HML layout excludes the legacy provider tree and all deep-linked legacy screens',()=>{
 const layout=read('../src/routes/_authenticated.tsx')
 assert.ok(layout.includes('if (isHmlDispatch) return <AuthGuard><HmlPassengerRecoveryScreen /></AuthGuard>'))
 assert.ok(layout.indexOf('if (isHmlDispatch) return')<layout.indexOf('<LocationProvider>'))
})
test('recovery screen is fail-closed without approved map or creation and without Google',()=>{
 const screen=read('../src/features/destination/HmlPassengerRecoveryScreen.tsx')
 assert.match(screen,/allowSelection: false, allowCreate: false, allowReturn: false/)
 assert.match(screen,/target !== "apois-navigation-control"/)
 assert.doesNotMatch(screen,/PassengerMap|useNavigate|\.from\(|\/corrida\//)
 const view=read('../src/lib/hml-navigation/durable-passenger-view.mjs')
 assert.match(view,/allowReturn&&host.canReturnToLegacy/)
 assert.match(view,/allowCreate&&r\?\.state==='review'/)
})
