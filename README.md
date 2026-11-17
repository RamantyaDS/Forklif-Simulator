# Simulator Forklift Toyota 4FD240

Simulator 3D forklift diesel **Toyota 4FD240 (24 ton)** di pelabuhan. Tugasnya: turunkan **genset Traknus 2250 kVA (14,8 ton)** dari truk flatbed, bawa, dan letakkan di area bermarka di atas balok kayu, tanpa menabrak, menjatuhkan genset, atau terguling.

Live: https://ramantyads.github.io/Forklif-Simulator/

Bagian dari seri simulator Traknus: forklift → [genset](https://ramantyads.github.io/Genset-Simulator/) → [traktor](https://ramantyads.github.io/Tractor-Simulator/). Model genset yang diangkat sama dengan model di Genset Simulator.

## Yang disimulasikan
- **Mesin Hino J08E-TM** (7,7 L, 159 kW @ 2300 rpm, 750 Nm @ 1600 rpm) dengan governor dan kurva torsi penuh.
- **Torque converter + powershift 2 maju / 1 mundur** otomatis: forklift merayap sendiri saat gigi masuk, stall converter ±1700 rpm, **pedal inching** untuk merayap sambil mesin digas (supaya hidrolik cepat).
- **Rem angin (air-over-hydraulic, wet disc)**: tekanan angin harus naik ke 5,5 bar sebelum rem parkir pegas bisa lepas, setiap pengereman memakai angin (bunyi "psst"), dan dryer membuang angin saat kompresor berhenti di 8,3 bar.
- **Kemudi roda belakang** dengan radius putar 5,9 m: ekor forklift mengayun keluar, dan setir berat saat mesin idle.
- **Hidrolik mast 2 tahap** (rantai 2:1): kecepatan angkat mengikuti rpm dan beban, tekanan silinder angkat dipakai sebagai **timbangan**, relief valve 210 bar, tilt 6° maju / 12° mundur, positioner garpu 0,72–2,75 m.
- **Segitiga stabilitas**: dua ban depan dan pin as belakang. Pusat berat gabungan diproyeksikan menurut percepatan (rem, belok). Kalau keluar dari segitiga, forklift benar-benar miring dan bisa **terguling ke samping** atau **terjungkal ke depan**. Garpu atau beban yang menyentuh tanah ikut menahan.
- **Load chart**: 24 t pada pusat beban 1250 mm, lebih kecil kalau beban lebih jauh dari muka garpu.
- **Genset sebagai muatan**: garpu harus masuk di antara balok kayu, di atas lantai bak (1,55 m) dan di bawah rangka (1,75 m). Genset bisa **bergeser** di atas garpu saat rem atau belok mendadak, dan **jatuh** kalau titik beratnya di luar garpu. Genset hanya bisa diletakkan di atas balok kayu supaya garpu tidak terjepit.
- Truk flatbed yang suspensinya naik saat beban diangkat, kapal kontainer, crane STS, tumpukan kontainer, gudang, menara lampu, dan mode siang/malam.

## Bantuan (bisa dimatikan)
SAS (batas kecepatan saat garpu tinggi, alarm sebelum terguling), gas otomatis untuk hidrolik, panduan langkah, proteksi ganti arah, dan angin rem penuh saat mulai.

## Kontrol
- **Keyboard**: W/S gas/rem, A/D setir, Shift inching, Q/E maju/mundur, N netral, R/F garpu naik/turun, T/G tilt, Y/H lebar garpu, P rem parkir, I mesin, B klakson, L lampu, V kamera, X overlay stabilitas.
- **Mouse**: seret untuk melihat sekeliling, roda mouse untuk zoom.
- **Gamepad**: stik kiri setir, RT/LT gas/rem, X inching, RB/LB maju/mundur, D-pad hidrolik, stik kanan kamera.
- **HP**: pad setir, pedal, tombol hidrolik dan arah di layar.
- Kamera: belakang, kabin (pandangan terhalang mast seperti aslinya), kamera garpu, bebas, atas.
- `?q=low` untuk laptop yang berat (resolusi 1× tanpa ambient occlusion).

## Data dan sumber
- Halaman produk Traknus 4FD240: kapasitas, pusat beban, lebar, panjang, tinggi kanopi, radius putar, mesin.
- Spec sheet Toyota High-Capacity IC Pneumatic 4FD150–230 (2016) untuk saudara terdekatnya, 4FD230: tinggi angkat, garpu, tilt, kecepatan, ban 14.00-24, rem, transmisi, hidrolik. Wheelbase, berat, dan counterweight 4FD240 diperkirakan dari 4FD230.
- Suara: rekaman diesel John Deere 5820 dan pompa hidrolik Komatsu 941 oleh Work With Sounds / Werstas (CC BY 4.0), start mesin bus diesel oleh Evan0512 (CC BY-SA 4.0), dari Wikimedia Commons. Mesin 6 silinder Hino, converter, rem angin, klakson, beeper, dan alarm disintesis.

## Pengembangan
```bash
npm install
npm run dev
npm test
```
Fisika ada di `src/sim` dan dites terhadap angka datasheet (`src/sim/forklift.test.ts`).
