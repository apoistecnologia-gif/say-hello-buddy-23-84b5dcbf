import {describe,expect,test} from "bun:test";
import {createHmlMobileTransport,HML_ORIGIN} from "../src/lib/hml-mobile-transport.ts";
const id="00000000-0000-4000-8000-000000000001";
const user={id};
const token="fixture.token.signature";
const session=async()=>({user,access_token:token});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
describe("isolated HML transport",()=>{
 test("only exact origin, path and bearer; no redirect or cookies",async()=>{
   let calls=0;
   const send=(async(url,opts)=>{calls++; expect(url).toBe(HML_ORIGIN+"/functions/v1/apois-hml-driver-dispatch");
      expect(opts?.redirect).toBe("error");expect(opts?.credentials).toBe("omit");
      expect(new Headers(opts?.headers).get("authorization")).toBe("Bearer "+token);
      return json({ok:true});});
   const t=createHmlMobileTransport({origin:HML_ORIGIN,session,send});
   expect(await t("driver",{action:"discover"})).toEqual({status:200,body:{ok:true}});expect(calls).toBe(1);
   expect(()=>createHmlMobileTransport({origin:"https://other.example",session,send})).toThrow();
 });
 test("discard late response after session changes",async()=>{
  let count=0;const t=createHmlMobileTransport({origin:HML_ORIGIN,session:async()=>({user,access_token:++count===1?token:"new.token.signature"}),send:(async()=>json({ok:true}))});
  await expect(t("pin",{action:"passenger_pin",rideId:id})).rejects.toThrow("hml_session_changed");
 });
 test("never resend on ambiguous network failure",async()=>{
  let calls=0;const t=createHmlMobileTransport({origin:HML_ORIGIN,session,send:(async()=>{calls++;throw Error("network")})});
  await expect(t("driver",{action:"start",rideId:id,pin:"1234"})).rejects.toThrow("hml_outcome_unknown");expect(calls).toBe(1);
 });
 test("reject non-json and oversized replies",async()=>{
  const t=createHmlMobileTransport({origin:HML_ORIGIN,session,send:(async()=>new Response("html"))});
  await expect(t("driver",{action:"discover"})).rejects.toThrow("hml_outcome_unknown");
  const b=createHmlMobileTransport({origin:HML_ORIGIN,session,send:(async()=>json({data:"x".repeat(17000)}))});
  await expect(b("driver",{action:"discover"})).rejects.toThrow("hml_outcome_unknown");
 });
 test("aborted or unauthenticated requests never send",async()=>{
  let calls=0;const send=(async()=>{calls++;return json({ok:true})});
  const t=createHmlMobileTransport({origin:HML_ORIGIN,session,send});
  const c=new AbortController();c.abort();await expect(t("driver",{action:"discover"},c.signal)).rejects.toThrow();
  const u=createHmlMobileTransport({origin:HML_ORIGIN,session:async()=>null,send});
  await expect(u("driver",{action:"discover"})).rejects.toThrow("hml_session_required");expect(calls).toBe(0);
 });
});
