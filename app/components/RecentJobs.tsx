"use client";
/* eslint-disable @next/next/no-img-element -- private generated data URLs */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveHandoff } from "@/lib/studioHandoff";

type Job={id:string;kind:string;state:string;created:number};
type ImageResult={base64:string;mimeType:string;width?:number;height?:number};
type Result={error?:string;image?:ImageResult;variants?:ImageResult[];reportId?:string};
export default function RecentJobs({id}:{id?:string}) {
  const router=useRouter();
  const [jobs,setJobs]=useState<Job[]>([]),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(""),[waiting,setWaiting]=useState(true);
  useEffect(()=>{
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    async function read(){
      try {
        const response=await fetch(id?`/api/jobs/${id}`:"/api/jobs",{cache:"no-store"});
        const data=await response.json();if(stopped)return;
        if(response.status===202){timer=setTimeout(read,5000);return;}
        if(!response.ok)throw new Error(data.error || "Could not retrieve artwork.");
        if(id)setResult(data);else setJobs(data.jobs || []);
        setWaiting(false);
      }catch(e){if(!stopped){setError(e instanceof Error?e.message:"Could not retrieve artwork.");setWaiting(false);}}
    }
    void read();return()=>{stopped=true;clearTimeout(timer);};
  },[id]);
  async function edit(image:ImageResult){
    try {
      const dataUrl=`data:${image.mimeType};base64,${image.base64}`;
      const decoded=new Image();decoded.src=dataUrl;await decoded.decode();
      saveHandoff({destination:"studio",dataUrl,name:"Recovered artwork",gameName:"",gamePitch:"",role:decoded.width===decoded.height?"icon":"keyArt",width:decoded.width,height:decoded.height,instruction:""});
      router.push("/?workspace=edit");
    }catch{setError("Could not open this artwork. Download it, then open it in Studio.");}
  }
  const images=result?.image?[result.image]:result?.variants || [];
  return <>
    {waiting && <p role="status">{id?"Your artwork is processing. You can leave this page and return to Recent jobs.":"Loading recent jobs…"}</p>}
    {error && <p role="alert">{error}</p>}
    {!id && !waiting && !jobs.length && <p>No recent background jobs in this wallet.</p>}
    {!id && jobs.map(job=><p key={job.id}><Link href={`/jobs/${job.id}`}>{job.kind==="analyze"?"Artwork review":job.kind==="fix"?"Artwork variants":"Studio artwork"} · {new Date(job.created).toLocaleString()}</Link> <span>— {job.state==="done"?"View result":job.state==="running"?"Processing":"Queued"}</span></p>)}
    {result?.reportId && /^[A-Za-z0-9_-]+$/.test(result.reportId) && <p><Link href={`/report/${result.reportId}`}>Open artwork review →</Link></p>}
    {images.map((image,index)=><section key={index} className="policy-section"><img src={`data:${image.mimeType};base64,${image.base64}`} alt={`Completed artwork ${index+1}`} style={{maxWidth:"100%",height:"auto",borderRadius:12}}/><p><button onClick={()=>void edit(image)}>Edit in Studio</button> · <a href={`data:${image.mimeType};base64,${image.base64}`} download={`dragonpixel-artwork-${index+1}.${image.mimeType==="image/png"?"png":image.mimeType==="image/jpeg"?"jpg":"webp"}`}>Download image</a></p></section>)}
    {id && <p><Link href="/jobs">← Recent jobs</Link></p>}
  </>;
}
