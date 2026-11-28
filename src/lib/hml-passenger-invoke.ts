// Only the reviewed HML aliases, never the legacy /functions/v1/request-ride.
import {createHmlMobileTransport,HML_ORIGIN,exact,record,uuid} from "./hml-mobile-transport";
type Session={access_token:string;user:{id:string}};
type InvokeOptions={body:unknown;headers?:Record<string,string>};
const controls=new Set(["apois_navigation_catalog","apois_navigation_confirm","apois_navigation_active","apois_navigation_recover","apois_navigation_seal"]);
const requests=new Set(["apois_navigation_quote","apois_navigation_create"]);
export function createHmlPassengerInvoke({origin,account,session,send=fetch}:{origin:string;account:string;session:()=>Promise<Session|null>;send?:typeof fetch}){
 if(origin!==HML_ORIGIN||!uuid(account))throw Error("HML passenger transport unavailable");
 return async(target:string,options:InvokeOptions)=>{
  const b=options.body;
  if(!record(b)||typeof b["action"]!=="string")throw Error("Invalid HML request");
  const control=target==="apois-navigation-control"&&controls.has(b["action"]);
  const request=target==="request-ride"&&requests.has(b["action"]);
  if(!control&&!request)throw Error("Unsupported HML request");
  const headers=options.headers;
  if(!exact(headers,["Authorization"])||typeof headers.Authorization!=="string")throw Error("Verified session required");
  const token=headers.Authorization;
  const verified=async()=>{
   const current=await session();
   return current?.user.id===account&&"Bearer "+current.access_token===token?current:null;
  };
  const invoke=createHmlMobileTransport({origin,session:verified,send,timeoutMs:10000});
  const response=await invoke(control?"passengerNavigation":"passengerRequest",b);
  if(response.status===200)return {data:response.body,error:null};
  return {data:null,error:{context:new Response(JSON.stringify(response.body),{status:response.status,headers:{"content-type":"application/json"}})}};
 };
}
