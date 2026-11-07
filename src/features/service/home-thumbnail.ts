import { StaticMapImageManager } from '@maplibre/maplibre-react-native';
import type { HomePath } from '@/modules/home/model';

const images=new Map<string,Promise<string>>(),styles=new Map<string,Promise<Record<string,unknown>>>();
let queue:Promise<unknown>=Promise.resolve();
/** One offscreen snapshot at a time: scrolling never mounts an interactive map. */
export function homeThumbnail(paths:HomePath[],styleUrl:string):Promise<string>{
  const key=JSON.stringify([styleUrl,paths]);const existing=images.get(key);if(existing)return existing;
  const work=async()=>{
    let style=styles.get(styleUrl);
    if(!style){style=fetch(styleUrl).then(r=>{if(!r.ok)throw new Error('Map style unavailable');return r.json() as Promise<Record<string,unknown>>;});styles.set(styleUrl,style);}
    const base=await style,points=paths.flat();if(!points.length)throw new Error('Empty preview');
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),dx=Math.max(.0001,Math.max(...xs)-Math.min(...xs))*.12,dy=Math.max(.0001,Math.max(...ys)-Math.min(...ys))*.12;
    const data={type:'FeatureCollection',features:paths.filter(p=>p.length>1).map(coordinates=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}}))};
    return StaticMapImageManager.createImage({mapStyle:{...base,sources:{...(base.sources as object),homeTrace:{type:'geojson',data}},layers:[...(base.layers as object[]),{id:'home-trace-outline',type:'line',source:'homeTrace',paint:{'line-color':'#FFFFFF','line-width':6}},{id:'home-trace',type:'line',source:'homeTrace',paint:{'line-color':'#FF5264','line-width':3}}]},bounds:[Math.min(...xs)-dx,Math.min(...ys)-dy,Math.max(...xs)+dx,Math.max(...ys)+dy],width:256,height:256,output:'file',logo:false});
  };
  const image=queue.catch(()=>{}).then(()=>{
    let timeout:ReturnType<typeof setTimeout>;
    return Promise.race([work(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Preview timeout')),15000);})]).finally(()=>clearTimeout(timeout));
  });
  // Keep successful and failed requests stable across list unmount/remount.
  images.set(key,image);queue=image.catch(()=>{});if(images.size>96)images.delete(images.keys().next().value!);return image;
}
