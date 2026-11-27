import {supabase} from "@/integrations/supabase/client";
import {createHmlMobileTransport,HML_ORIGIN,uuid,exact} from "./hml-mobile-transport";
export const isHmlDispatch = import.meta.env["VITE_SUPABASE_URL"] === HML_ORIGIN;
const request=()=>createHmlMobileTransport({origin:import.meta.env["VITE_SUPABASE_URL"],session:async()=>{
 const {data,error}=await supabase.auth.getSession();
 return error?null:data.session;
}});
// Requires independently confirmed assignment generation. Never fall back to rides.security_code.
export async function readHmlPassengerPin(rideId:string,driverId:string,generation:string,signal?:AbortSignal):Promise<string>{
 if(!isHmlDispatch||![rideId,driverId,generation].every(uuid))throw Error("Embarque não confirmado.");
 const {status,body:b}=await request()("pin",{action:"passenger_pin",rideId,expectedGeneration:generation},signal);
 if(status!==200||!exact(b,["ok","rideId","driverId","generation","pin"])||b["ok"]!==true||b["rideId"]!==rideId||b["driverId"]!==driverId||b["generation"]!==generation||typeof b["pin"]!=="string"||!/^\d{4}$/.test(b["pin"]))
  throw Error("PIN indisponível. Atualize a corrida.");
 return b["pin"];
}

export async function readHmlPassengerProfile(subject:string){
 if(!isHmlDispatch||!uuid(subject))throw Error("unauthorized");
 const {status,body:b}=await request()("pin",{action:"profile"});
 const p=b["profile"];
 if(status===401||status===403)throw Error("unauthorized");
 if(status!==200||!exact(b,["ok","profile"])||b["ok"]!==true||!exact(p,["id","auth_user_id"])||!uuid(p["id"])||p["auth_user_id"]!==subject)
  throw Error("profile_unavailable");
 return p;
}
export async function readHmlPassengerRide(passengerId:string,rideId?:string){
 if(!isHmlDispatch||!uuid(passengerId)||(rideId!==undefined&&!uuid(rideId)))throw Error("unauthorized");
 const {status,body:b}=await request()("pin",rideId?{action:"ride",rideId}:{action:"active"});
 if(status===401||status===403)throw Error("unauthorized");
 if(status!==200||!exact(b,["ok","ride","generation"])||b["ok"]!==true)throw Error("ride_unavailable");
 if(b["ride"]===null){if(rideId||b["generation"]!==null)throw Error("ride_unavailable");return null;}
 const ride=b["ride"];
 if(!ride||typeof ride!=="object"||Array.isArray(ride))throw Error("ride_unavailable");
 const r=ride as Record<string,unknown>;
 if(!uuid(r["id"])||(rideId&&r["id"]!==rideId)||r["passenger_id"]!==passengerId||
  ["security_code","request_key","share_token","provider_payment_id","final_price"].some(k=>Object.prototype.hasOwnProperty.call(r,k)))throw Error("ride_unavailable");
 const assigned=["motorista_a_caminho","motorista_chegou","em_viagem"].includes(String(r["status"]));
 if(assigned?(!uuid(r["driver_id"])||!uuid(b["generation"])):b["generation"]!==null)throw Error("ride_unavailable");
 return {ride:r,generation:typeof b["generation"]==="string"?b["generation"]:undefined};
}
