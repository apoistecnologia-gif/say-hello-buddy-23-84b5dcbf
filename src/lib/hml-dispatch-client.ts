import {supabase} from "@/integrations/supabase/client";
import {createHmlMobileTransport,HML_ORIGIN,uuid,exact} from "./hml-mobile-transport";
export const isHmlDispatch = import.meta.env.VITE_SUPABASE_URL === HML_ORIGIN;
const request=()=>createHmlMobileTransport({origin:import.meta.env.VITE_SUPABASE_URL,session:async()=>{
 const {data,error}=await supabase.auth.getSession();
 return error?null:data.session;
}});
// Requires independently confirmed assignment generation. Never fall back to rides.security_code.
export async function readHmlPassengerPin(rideId:string,driverId:string,generation:string,signal?:AbortSignal):Promise<string>{
 if(!isHmlDispatch||![rideId,driverId,generation].every(uuid))throw Error("Embarque não confirmado.");
 const {status,body:b}=await request()("pin",{action:"passenger_pin",rideId,expectedGeneration:generation},signal);
 if(status!==200||!exact(b,["ok","rideId","driverId","generation","pin"])||b.ok!==true||b.rideId!==rideId||b.driverId!==driverId||b.generation!==generation||typeof b.pin!=="string"||!/^\d{4}$/.test(b.pin))
  throw Error("PIN indisponível. Atualize a corrida.");
 return b.pin;
}
