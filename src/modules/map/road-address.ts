/** Hide house/unit numbers while retaining the provider's administrative labels. */
export function roadAddress(address:string) {
  const parts=address.replace(/\b\d{5}\b/g,'').split(',').map(s=>s.trim()).filter(s=>s&&!/^(대한민국|South Korea|Republic of Korea)$/i.test(s));
  const road=/(?:대로|로|길)(?:\d+번?길)?$/;
  if(parts.length>1&&parts[0].split(/\s+/).some(word=>road.test(word))&&!parts.at(-1)!.split(/\s+/).some(word=>road.test(word)))parts.reverse();
  const words=parts.join(' ').split(/\s+/).filter(Boolean),index=words.findLastIndex(word=>road.test(word));
  return index>=0?words.slice(0,index+1).join(' '):words.join(' ').replace(/\s+\d+(?:-\d+)?(?:번지)?(?:\s.*)?$/,'');
}
