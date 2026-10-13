import { unzlibSync } from 'fflate';

/** Decode only small, non-interlaced 8-bit PNGs produced by the native resizer. */
export function decodeContourPng(bytes: Uint8Array) {
  const fail = () => { throw new Error('이미지를 읽지 못했어요. 다른 이미지를 선택해 주세요.'); };
  if (bytes.length < 33 || bytes.length > 2_000_000 || ![137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, channels = 0, ended = false;
  const pieces: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset), start = offset + 8, end = start + length;
    if (end + 4 > bytes.length) return fail();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, start));
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) return fail();
      width = view.getUint32(start); height = view.getUint32(start + 4);
      channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[bytes[start + 9]] ?? 0;
      if (!width || !height || width > 256 || height > 256 || bytes[start + 8] !== 8 || !channels ||
          bytes[start + 10] !== 0 || bytes[start + 11] !== 0 || bytes[start + 12] !== 0) return fail();
    } else if (type === 'IDAT') pieces.push(bytes.subarray(start, end));
    else if (type === 'IEND') { ended = true; break; }
    offset = end + 4;
  }
  if (!ended || !width || !pieces.length) return fail();
  const packed = new Uint8Array(pieces.reduce((n,p) => n+p.length,0));
  let cursor = 0; for (const piece of pieces) { packed.set(piece,cursor); cursor += piece.length; }
  const stride = width * channels, expected = (stride + 1) * height;
  const inflated = unzlibSync(packed, { out: new Uint8Array(expected + 1) });
  if (inflated.length !== expected) return fail();
  const raw = new Uint8Array(stride * height);
  const paeth = (a: number, b: number, c: number) => { const p=a+b-c, x=Math.abs(p-a), y=Math.abs(p-b), z=Math.abs(p-c); return x<=y && x<=z ? a : y<=z ? b : c; };
  for (let y=0;y<height;y++) {
    const filter = inflated[y*(stride+1)]; if (filter > 4) return fail();
    for (let x=0;x<stride;x++) {
      const i=y*stride+x, a=x>=channels ? raw[i-channels] : 0, b=y ? raw[i-stride] : 0, c=y && x>=channels ? raw[i-stride-channels] : 0;
      raw[i] = inflated[y*(stride+1)+1+x] + [0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
    }
  }
  const rgba = new Uint8Array(width*height*4);
  for (let i=0;i<width*height;i++) {
    const p=i*channels, dest=i*4;
    rgba[dest]=raw[p]; rgba[dest+1]=raw[p+(channels>=3?1:0)]; rgba[dest+2]=raw[p+(channels>=3?2:0)];
    rgba[dest+3]=channels===2 ? raw[p+1] : channels===4 ? raw[p+3] : 255;
  }
  return { width, height, rgba };
}
