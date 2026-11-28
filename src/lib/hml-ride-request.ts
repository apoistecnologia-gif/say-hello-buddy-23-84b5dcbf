// Contract for the already-tested v21 request handler. The authenticated
// transport is injected; no public endpoint or legacy fallback is assumed.
import {exact,uuid} from "./hml-mobile-transport";
type Result={status:number;body:Record<string,unknown>};
type Selection={selectionId:string;requestKey:string};
type Quote={estimated_price:number;fare_amount_cents:number;distance_km:number;duration_min:number;expiresAt:string};
type Created={rideId:string;status:string;reused:boolean;estimated_price:number;fare_amount_cents:number;payment_status:string;candidates:number};
type Send=(body:Record<string,unknown>)=>Promise<Result>;
const quoteKeys=["estimated_price","fare_amount_cents","distance_km","duration_min","expiresAt"];
const positive=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>0;
const cents=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
function price(b:Record<string,unknown>){
 return positive(b["estimated_price"])&&cents(b["fare_amount_cents"])&&b["estimated_price"]===b["fare_amount_cents"]/100;
}
function parseQuote(b:Record<string,unknown>,now:number):Quote{
 if(!price(b)||!positive(b["distance_km"])||!cents(b["duration_min"])||typeof b["expiresAt"]!=="string"||!Number.isFinite(Date.parse(b["expiresAt"]))||Date.parse(b["expiresAt"])<=now)throw Error("Cotação inválida ou expirada.");
 return {estimated_price:b["estimated_price"] as number,fare_amount_cents:b["fare_amount_cents"] as number,distance_km:b["distance_km"],duration_min:b["duration_min"],expiresAt:b["expiresAt"]};
}
const selection=(s:Selection)=>{if(!uuid(s.selectionId)||!uuid(s.requestKey))throw Error("Seleção inválida.");return {selectionId:s.selectionId,requestKey:s.requestKey,payment_method:"cash"};};
export function createHmlRideRequestClient(send:Send,now=Date.now){
 let pending=false;
 return {
  async quote(s:Selection):Promise<Quote>{
   const {status,body:b}=await send({action:"apois_navigation_quote",...selection(s)});
   if(status!==200||!exact(b,["ok",...quoteKeys])||b["ok"]!==true)throw Error("Não foi possível obter a cotação.");
   return parseQuote(b,now());
  },
  async create(s:Selection,confirmedCents:number):Promise<{kind:"created";ride:Created}|{kind:"price_changed";quote:Quote}>{
   if(pending)throw Error("Aguarde a confirmação da solicitação.");
   if(!cents(confirmedCents))throw Error("Valor inválido.");
   const payload={action:"apois_navigation_create",...selection(s),expected_price_cents:confirmedCents};
   pending=true;
   try{
    const {status,body:b}=await send(payload);
    if(status===409&&exact(b,["ok","error_code",...quoteKeys])&&b["ok"]===false&&b["error_code"]==="price_changed")return {kind:"price_changed",quote:parseQuote(b,now())};
    if(status!==200||!exact(b,["ok","rideId","status","reused","estimated_price","fare_amount_cents","payment_status","candidates"])||b["ok"]!==true||!uuid(b["rideId"])||typeof b["reused"]!=="boolean"||typeof b["status"]!=="string"||!price(b)||(!b["reused"]&&(b["status"]!=="procurar_motorista"||b["fare_amount_cents"]!==confirmedCents||b["payment_status"]!=="pending"))||typeof b["payment_status"]!=="string"||typeof b["candidates"]!=="number"||!Number.isInteger(b["candidates"])||b["candidates"]<0||b["candidates"]>5)throw Error("Solicitação não confirmada. Preserve a mesma chave para recuperar.");
    return {kind:"created",ride:{rideId:b["rideId"],status:b["status"],reused:b["reused"],estimated_price:b["estimated_price"] as number,fare_amount_cents:b["fare_amount_cents"] as number,payment_status:b["payment_status"],candidates:b["candidates"]}};
   }finally{pending=false;}
  }
 };
}
