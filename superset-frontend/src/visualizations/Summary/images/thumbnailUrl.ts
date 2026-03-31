const thumbnailSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#f5f7fb"/>
      <stop offset="100%" stop-color="#e9eef6"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" rx="28" fill="url(#bg)"/>
  <rect x="42" y="42" width="516" height="316" rx="22" fill="#ffffff" stroke="#d6deea" stroke-width="3"/>
  <rect x="68" y="78" width="168" height="92" rx="18" fill="#f8fbff" stroke="#dfe7f3"/>
  <rect x="254" y="78" width="122" height="92" rx="18" fill="#f8fbff" stroke="#dfe7f3"/>
  <rect x="394" y="78" width="138" height="92" rx="18" fill="#f8fbff" stroke="#dfe7f3"/>
  <rect x="68" y="192" width="464" height="52" rx="14" fill="#f8fbff" stroke="#dfe7f3"/>
  <rect x="68" y="260" width="220" height="70" rx="16" fill="#f8fbff" stroke="#dfe7f3"/>
  <rect x="306" y="260" width="226" height="70" rx="16" fill="#f8fbff" stroke="#dfe7f3"/>
  <rect x="88" y="95" width="56" height="10" rx="5" fill="#6a7c92" opacity="0.8"/>
  <rect x="88" y="118" width="110" height="26" rx="6" fill="#183a5a"/>
  <rect x="274" y="95" width="42" height="10" rx="5" fill="#6a7c92" opacity="0.8"/>
  <rect x="274" y="118" width="72" height="26" rx="6" fill="#1d8f72"/>
  <rect x="414" y="95" width="42" height="10" rx="5" fill="#6a7c92" opacity="0.8"/>
  <rect x="414" y="118" width="82" height="26" rx="6" fill="#aa5b00"/>
  <rect x="90" y="210" width="88" height="10" rx="5" fill="#6a7c92" opacity="0.8"/>
  <rect x="410" y="206" width="96" height="18" rx="9" fill="#dff4eb"/>
  <path d="M424 215l7-7 7 7" fill="none" stroke="#1d8f72" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="90" y="277" width="62" height="10" rx="5" fill="#6a7c92" opacity="0.8"/>
  <rect x="90" y="298" width="120" height="10" rx="5" fill="#183a5a"/>
  <polyline points="335,312 354,301 372,308 390,286 409,294 427,278 447,290 467,270 486,280" fill="none" stroke="#1d8f72" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

export default `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  thumbnailSvg,
)}`;
