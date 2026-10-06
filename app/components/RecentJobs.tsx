"use client";
/* eslint-disable @next/next/no-img-element -- private generated data URLs */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveHandoff } from "@/lib/studioHandoff";
import type { CalculatedReport } from "@/lib/analyzerCore";
import ResultsOverview, { ResultPriorities } from "./ResultsOverview";

type Job={id:string;kind:string;state:string;created:number;outcome:string;reportId?:string;analysisReturned?:boolean;refunded?:number};
type ImageResult={base64:string;mimeType:string;width?:number;height?:number};
type Result={error?:string;image?:ImageResult;variants?:ImageResult[];reportId?:string;calculated?:CalculatedReport;analysisReturned?:boolean;credits?:{charged?:number;refunded?:number}};
const label=(kind:string)=>kind==="analyze"?"Artwork review":kind==="fix"?"Artwork variants":"Studio artwork";
const status:Record<string,string>={succeeded:"Ready",failed:"Failed",running:"Processing",queued:"Queued",unavailable:"Expired"};
export default function RecentJobs({id}:{id?:string}) {
  const router=useRouter();
  const [jobs,setJobs]=useState<Job[]>([]),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(""),[waiting,setWaiting]=useState(true),[failed,setFailed]=useState(false);
  useEffect(()=>{
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    async function read(){
      try {
        const response=await fetch(id?`/api/jobs/${id}`:"/api/jobs",{cache:"no-store"});
        const data=await response.json();if(stopped)return;
        if(response.status===202){timer=setTimeout(read,5000);return;}
        if(!response.ok){
          if(id && response.headers.get("X-Artwork-Job-State")==="done"){setResult(data);setFailed(true);setWaiting(false);return;}
          throw new Error(data.error || "Could not retrieve artwork.");
        }
        if(id){
          setResult(data);
          if(typeof data.reportId==="string" && /^[A-Za-z0-9_-]{8,24}$/.test(data.reportId)) router.replace(`/report/${data.reportId}`);
        }else{
          setJobs(data.jobs || []);
          if(data.jobs?.some((job:Job)=>job.state!=="done"))timer=setTimeout(read,5000);
        }
        setWaiting(false);
      }catch(e){if(!stopped){setError(e instanceof Error?e.message:"Could not retrieve artwork.");setWaiting(false);}}
    }
    void read();return()=>{stopped=true;clearTimeout(timer);};
  },[id,router]);
  async function edit(image:ImageResult){
    try {
      const dataUrl=`data:${image.mimeType};base64,${image.base64}`;
      const decoded=new Image();decoded.src=dataUrl;await decoded.decode();
      saveHandoff({destination:"studio",dataUrl,name:"Recovered artwork",gameName:"",gamePitch:"",role:decoded.width===decoded.height?"icon":"keyArt",width:decoded.width,height:decoded.height,instruction:""});
      router.push("/?workspace=edit");
    }catch{setError("Could not open this artwork. Download it, then open it in Studio.");}
  }
  const images=result?.image?[result.image]:result?.variants || [];
  const calculated=result?.calculated;
  return <>
    {waiting && <div className="job-notice" role="status"><span className="job-badge" data-status="running">Processing</span><h2>{id?"Preparing your result":"Loading recent jobs"}</h2><p>You can return here when it is ready.</p></div>}
    {error && <div className="job-notice" role="alert"><h2>Could not load this result</h2><p>{error}</p><button className="job-action" onClick={()=>window.location.reload()}>Try again</button></div>}
    {failed && <div className="job-notice" role="status"><span className="job-badge" data-status="failed">Not completed</span><h2>No result was produced</h2><p>{result?.error}</p>{result?.analysisReturned && <p className="job-refund">Your free review slot was returned. Credits were not used.</p>}{!!result?.credits?.refunded && <p className="job-refund">{result.credits.refunded} credit returned.</p>}<div className="job-actions"><Link className="job-action" href="/analyze">Review an image</Link><Link className="job-action secondary" href="/">Open Studio</Link></div></div>}
    {!id && !waiting && !error && <>
      <div className="jobs-toolbar"><span>{jobs.filter(job=>job.outcome==="succeeded").length} ready to view</span><span>Available for 24 hours</span></div>
      {!jobs.length && <div className="job-notice"><h2>Your artwork will appear here</h2><p>Completed reviews and generated images are saved to this wallet.</p><Link className="job-action" href="/analyze">Review an image</Link></div>}
      <div className="jobs-list">{jobs.map(job=><article className="job-card" key={job.id}>
        <div className="job-symbol" aria-hidden="true">{job.kind==="analyze"?"▥":"▧"}</div>
        <div className="job-description"><h2>{label(job.kind)}</h2><time dateTime={new Date(job.created).toISOString()}>{new Date(job.created).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time>{job.analysisReturned && <p className="job-refund">Review slot returned</p>}{!!job.refunded && <p className="job-refund">{job.refunded} credit returned</p>}</div>
        <span className="job-badge" data-status={job.outcome}>{status[job.outcome] || "Processing"}</span>
        <Link className={`job-action ${job.outcome==="succeeded"?"":"secondary"}`} href={job.outcome==="succeeded" && job.reportId?`/report/${job.reportId}`:`/jobs/${job.id}`}>{job.outcome==="succeeded"?"View result":job.outcome==="failed"?"View details":"Check status"}<span aria-hidden="true"> →</span></Link>
      </article>)}</div>
    </>}
    {calculated && <><ResultsOverview score={calculated.launchScore} rows={calculated.breakdown.map(row=>({label:row.label,value:row.assessed?(calculated.scores[row.key as keyof typeof calculated.scores] ?? null):null}))} mode="Artwork review" priorities={calculated.topFixes.length}/><ResultPriorities fixes={calculated.topFixes}/></>}
    {result?.reportId && /^[A-Za-z0-9_-]{8,24}$/.test(result.reportId) && <Link className="job-action" href={`/report/${result.reportId}`}>Open full review →</Link>}
    {images.map((image,index)=><section key={index} className="job-notice"><img src={`data:${image.mimeType};base64,${image.base64}`} alt={`Completed artwork ${index+1}`} style={{maxWidth:"100%",height:"auto",borderRadius:12}}/><div className="job-actions"><button className="job-action" onClick={()=>void edit(image)}>Edit in Studio</button><a className="job-action secondary" href={`data:${image.mimeType};base64,${image.base64}`} download={`dragonpixel-artwork-${index+1}.${image.mimeType==="image/png"?"png":image.mimeType==="image/jpeg"?"jpg":"webp"}`}>Download image</a></div></section>)}
    {id && <Link className="jobs-back" href="/jobs">← Recent jobs</Link>}
  </>;
}
