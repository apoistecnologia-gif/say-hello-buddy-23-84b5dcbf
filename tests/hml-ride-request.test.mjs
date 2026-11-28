import {describe,test,expect} from "bun:test";
import {createHmlRideRequestClient} from "../src/lib/hml-ride-request.ts";
const s={selectionId:"00000000-0000-4000-8000-000000000021",requestKey:"00000000-0000-4000-8000-000000000022"};
const now=Date.parse("2026-11-28T00:00:00Z"),q={estimated_price:13.86,fare_amount_cents:1386,distance_km:3.93,duration_min:6,expiresAt:new Date(now+60000).toISOString()};
const ride={ok:true,rideId:"00000000-0000-4000-8000-000000000023",status:"procurar_motorista",reused:false,estimated_price:13.86,fare_amount_cents:1386,payment_status:"pending",candidates:0};
describe("v21 request contract",()=>{
 test("quote sends only selection identity and cash; no client geometry or fare",async()=>{
  const c=createHmlRideRequestClient(async b=>{expect(b).toEqual({action:"apois_navigation_quote",...s,payment_method:"cash"});return {status:200,body:{ok:true,...q}}},()=>now);
  expect(await c.quote(s)).toEqual(q);
 });
 test("changed price requires explicit new confirmation; no auto create",async()=>{
  let calls=0;const c=createHmlRideRequestClient(async b=>{calls++;expect(b).toEqual({action:"apois_navigation_create",...s,payment_method:"cash",expected_price_cents:1200});return {status:409,body:{ok:false,error_code:"price_changed",...q}}},()=>now);
  expect(await c.create(s,1200)).toEqual({kind:"price_changed",quote:q});expect(calls).toBe(1);
 });
 test("create uses exact key and server-confirmed price",async()=>{
  const c=createHmlRideRequestClient(async b=>{expect(b.requestKey).toBe(s.requestKey);return {status:200,body:ride}},()=>now);
  expect((await c.create(s,1386)).kind).toBe("created");
  await expect(c.create(s,1200)).rejects.toThrow();
 });
 test("lost response never creates a second request automatically",async()=>{
  let calls=0;const c=createHmlRideRequestClient(async()=>{calls++;throw Error("network")},()=>now);
  await expect(c.create(s,1386)).rejects.toThrow();expect(calls).toBe(1);
 });
 test("concurrent request rejected; explicit recovery preserves same key",async()=>{
  let release;const gate=new Promise(r=>release=r);let calls=0;const c=createHmlRideRequestClient(async b=>{calls++;expect(b.requestKey).toBe(s.requestKey);await gate;return {status:200,body:{...ride,reused:true}}},()=>now);
  const pending=c.create(s,1386);await expect(c.create(s,1386)).rejects.toThrow();release();await pending;await c.create(s,1386);expect(calls).toBe(2);
 });
 test("expired quote or inconsistent amount refused",async()=>{
  const c=createHmlRideRequestClient(async()=>({status:200,body:{ok:true,...q,expiresAt:new Date(now).toISOString()}}),()=>now);
  await expect(c.quote(s)).rejects.toThrow();
  const d=createHmlRideRequestClient(async()=>({status:200,body:{ok:true,...q,fare_amount_cents:100}}),()=>now);
  await expect(d.quote(s)).rejects.toThrow();
 });
});
