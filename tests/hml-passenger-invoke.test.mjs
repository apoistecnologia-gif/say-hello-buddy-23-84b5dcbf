import {describe,test,expect} from "bun:test";
import {createHmlPassengerInvoke} from "../src/lib/hml-passenger-invoke.ts";
import {HML_ORIGIN} from "../src/lib/hml-mobile-transport.ts";
const account="00000000-0000-4000-8000-000000000021",token="fixture.token.signature";
const session=async()=>({user:{id:account},access_token:token}),headers={Authorization:"Bearer "+token};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
describe("HML passenger host adapter",()=>{
 test("control and request use exact isolated aliases",async()=>{
  const calls=[];const invoke=createHmlPassengerInvoke({origin:HML_ORIGIN,account,session,send:async(url,opts)=>{calls.push(url);expect(new Headers(opts.headers).get("authorization")).toBe(headers.Authorization);return reply({ok:true})}});
  await invoke("apois-navigation-control",{headers,body:{action:"apois_navigation_catalog"}});
  await invoke("request-ride",{headers,body:{action:"apois_navigation_quote"}});
  expect(calls).toEqual([HML_ORIGIN+"/functions/v1/apois-hml-passenger-navigation",HML_ORIGIN+"/functions/v1/apois-hml-passenger-request"]);
 });
 test("price change survives adapter without automatic retry",async()=>{
  let count=0;const invoke=createHmlPassengerInvoke({origin:HML_ORIGIN,account,session,send:async()=>{count++;return reply({ok:false,error_code:"price_changed"},409)}});
  const r=await invoke("request-ride",{headers,body:{action:"apois_navigation_create"}});
  expect(r.error.context.status).toBe(409);expect(await r.error.context.json()).toEqual({ok:false,error_code:"price_changed"});expect(count).toBe(1);
 });
 test("legacy action or changed token never reaches network",async()=>{
  let count=0;const invoke=createHmlPassengerInvoke({origin:HML_ORIGIN,account,session,send:async()=>{count++;return reply({ok:true})}});
  await expect(invoke("request-ride",{headers,body:{action:"create"}})).rejects.toThrow();
  await expect(invoke("request-ride",{headers:{Authorization:"Bearer wrong.token.fixture"},body:{action:"apois_navigation_create"}})).rejects.toThrow();
  expect(count).toBe(0);
 });
 test("large bounded catalog works but oversized response fails",async()=>{
  const small=createHmlPassengerInvoke({origin:HML_ORIGIN,account,session,send:async()=>reply({rows:"x".repeat(20000)})});
  expect((await small("apois-navigation-control",{headers,body:{action:"apois_navigation_catalog"}})).data.rows.length).toBe(20000);
  const huge=createHmlPassengerInvoke({origin:HML_ORIGIN,account,session,send:async()=>reply({rows:"x".repeat(600000)})});
  await expect(huge("apois-navigation-control",{headers,body:{action:"apois_navigation_catalog"}})).rejects.toThrow();
 });
});
