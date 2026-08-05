/* ===== Brand colour from the venue's own logo =====
   Upload a logo and the app takes its colour. The point is that an owner who
   has never opened a colour picker gets a system that looks like theirs.

   The colour is NOT used as found. --accent carries white text on top of it
   (.btn-accent) AND is itself used as text on the paper background (.tag), so a
   pale logo — yellow, mint, pastel pink — used raw gives white-on-yellow
   buttons that nobody can read. The hue and the saturation come from the logo;
   the lightness is moved until both readings clear WCAG AA, and the screen says
   when it had to move. A brand that is slightly off is a fixable complaint. A
   button whose label cannot be read is not.

   Everything is overridable by hand, because the venue knows its own brand
   better than a pixel histogram does.

   Stored on the kitchen record (so it syncs across devices), applied to the
   :root custom properties at boot.
*/
window.MKR = window.MKR || {};
(function(){
  const PAPER = '#F6F2EC';   // must match --paper in styles.css
  const DEFAULTS = { accent:'#C9612E', accentSoft:'#F4E2D5', accentInk:'#9A4516' };

  // ---------- colour maths ----------
  const clamp = (n,a,b)=> Math.min(b, Math.max(a, n));
  function hexToRgb(h){
    h = String(h||'').replace('#','');
    if(h.length===3) h = h.split('').map(c=>c+c).join('');
    const n = parseInt(h,16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }
  const rgbToHex = (r,g,b)=> '#'+[r,g,b].map(x=>clamp(Math.round(x),0,255).toString(16).padStart(2,'0')).join('').toUpperCase();

  function rgbToHsl(r,g,b){
    r/=255; g/=255; b/=255;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
    let h=0; const l=(mx+mn)/2;
    const s = d===0 ? 0 : d/(1-Math.abs(2*l-1));
    if(d!==0){
      if(mx===r) h=((g-b)/d)%6; else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4;
      h*=60; if(h<0) h+=360;
    }
    return [h, s, l];
  }
  function hslToRgb(h,s,l){
    const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs(((h/60)%2)-1)), m=l-c/2;
    let r,g,b;
    if(h<60)      [r,g,b]=[c,x,0];
    else if(h<120)[r,g,b]=[x,c,0];
    else if(h<180)[r,g,b]=[0,c,x];
    else if(h<240)[r,g,b]=[0,x,c];
    else if(h<300)[r,g,b]=[x,0,c];
    else          [r,g,b]=[c,0,x];
    return [(r+m)*255, (g+m)*255, (b+m)*255];
  }

  // WCAG relative luminance and contrast ratio — the actual standard, not an
  // eyeballed brightness formula, because "looks dark enough" is exactly the
  // judgement that produces unreadable buttons.
  function luminance(hex){
    const [r,g,b] = hexToRgb(hex).map(v=>{
      const c = v/255;
      return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
    });
    return 0.2126*r + 0.7152*g + 0.0722*b;
  }
  function contrast(a, b){
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la,lb)+0.05) / (Math.min(la,lb)+0.05);
  }
  const hslHex = (h,s,l)=> rgbToHex(...hslToRgb(h, clamp(s,0,1), clamp(l,0,1)));

  // ---------- pull a colour out of the logo ----------
  // Bucket by hue, weight by how colourful and how opaque the pixel is, and
  // ignore anything that is basically paper or basically ink: a logo is mostly
  // its background and its outline, and both would win a plain vote.
  function extract(dataUrl){
    return new Promise((resolve)=>{
      const img = new Image();
      img.onerror = ()=> resolve(null);
      img.onload = ()=>{
        try{
          const N = 72;
          const cv = document.createElement('canvas');
          cv.width = N; cv.height = N;
          const ctx = cv.getContext('2d', {willReadFrequently:true});
          ctx.drawImage(img, 0, 0, N, N);
          const px = ctx.getImageData(0,0,N,N).data;
          const buckets = new Map();   // hue/10 → {w, h, s, l}
          for(let i=0;i<px.length;i+=4){
            const a = px[i+3]/255;
            if(a < 0.5) continue;                       // transparent padding
            const [h,s,l] = rgbToHsl(px[i], px[i+1], px[i+2]);
            if(s < 0.18) continue;                      // greys, white, black
            if(l > 0.95 || l < 0.06) continue;          // paper and ink
            const k = Math.round(h/10);
            const w = s * a;                            // colourful pixels count more
            const b = buckets.get(k) || {w:0, h:0, s:0, l:0};
            b.w += w; b.h += h*w; b.s += s*w; b.l += l*w;
            buckets.set(k, b);
          }
          if(!buckets.size) return resolve(null);
          let best = null;
          buckets.forEach(b=>{ if(!best || b.w > best.w) best = b; });
          resolve({ h: best.h/best.w, s: best.s/best.w, l: best.l/best.w });
        }catch(e){ resolve(null); }
      };
      img.src = dataUrl;
    });
  }

  // ---------- turn one colour into a readable set of three ----------
  // Hue and saturation are the brand's. Lightness is negotiable, and it is the
  // only thing that gets moved.
  function derive(seed){
    const {h, s} = seed;
    const sat = clamp(s, 0.35, 0.85);   // a nearly-grey brand still needs to read as a colour

    // --accent must carry white text AND be legible as text on paper. Walk it
    // darker until both hold. AA for normal text is 4.5:1.
    let accent = null, adjusted = false;
    const start = clamp(seed.l, 0.20, 0.62);
    for(let l = start; l >= 0.14; l -= 0.02){
      const hex = hslHex(h, sat, l);
      if(contrast(hex, '#FFFFFF') >= 4.5 && contrast(hex, PAPER) >= 4.5){ accent = hex; adjusted = Math.abs(l-seed.l) > 0.03; break; }
    }
    if(!accent){ accent = hslHex(h, sat, 0.14); adjusted = true; }

    // --accent-ink sits on --accent-soft, so it is checked against that, not
    // against white. Otherwise a mid-tone ink passes here and disappears there.
    const accentSoft = hslHex(h, clamp(sat*0.45, 0.10, 0.40), 0.92);
    let accentInk = null;
    for(let l = 0.34; l >= 0.10; l -= 0.02){
      const hex = hslHex(h, clamp(sat*1.05, 0, 0.95), l);
      if(contrast(hex, accentSoft) >= 4.5){ accentInk = hex; break; }
    }
    if(!accentInk) accentInk = hslHex(h, sat, 0.12);

    return { accent, accentSoft, accentInk, adjusted, seedHex: hslHex(h, s, seed.l) };
  }

  // ---------- apply / persist ----------
  function apply(brand){
    const root = document.documentElement;
    const b = brand && brand.accent ? brand : DEFAULTS;
    root.style.setProperty('--accent', b.accent);
    root.style.setProperty('--accent-soft', b.accentSoft || DEFAULTS.accentSoft);
    root.style.setProperty('--accent-ink', b.accentInk || DEFAULTS.accentInk);
  }
  function reset(){
    const root = document.documentElement;
    ['--accent','--accent-soft','--accent-ink'].forEach(v=> root.style.removeProperty(v));
  }

  function kid(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.kitchenId)||'k_main'; }
  async function load(){
    try{
      const k = await MKR.db.get('kitchens', kid());
      if(k && k.brand && k.brand.accent){ apply(k.brand); return k.brand; }
    }catch(e){}
    reset();
    return null;
  }
  async function save(brand){
    await MKR.db.put('kitchens', {id:kid(), brand: brand || null});
    if(brand) apply(brand); else reset();
  }
  // Everything from a logo in one step, for the upload handlers.
  async function fromLogo(dataUrl){
    const seed = await extract(dataUrl);
    return seed ? derive(seed) : null;
  }

  MKR.brand = { extract, derive, apply, reset, load, save, fromLogo,
                contrast, DEFAULTS, PAPER };
})();
