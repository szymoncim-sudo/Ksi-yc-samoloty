// ICAO type designator → wingspan (m), planform class and readable name.
export type Planform = 'jet2' | 'jet4' | 'prop' | 'bizjet' | 'light' | 'heli' | 'fighter';

export interface TypeInfo {
  span: number;
  form: Planform;
  name: string;
}

const RAW = `
A318|34.1|jet2|Airbus A318
A319|35.8|jet2|Airbus A319
A320|35.8|jet2|Airbus A320
A321|35.8|jet2|Airbus A321
A19N|35.8|jet2|Airbus A319neo
A20N|35.8|jet2|Airbus A320neo
A21N|35.8|jet2|Airbus A321neo
BCS1|35.1|jet2|Airbus A220-100
BCS3|35.1|jet2|Airbus A220-300
A306|44.8|jet2|Airbus A300-600
A310|43.9|jet2|Airbus A310
A332|60.3|jet2|Airbus A330-200
A333|60.3|jet2|Airbus A330-300
A338|64.0|jet2|Airbus A330-800neo
A339|64.0|jet2|Airbus A330-900neo
A337|60.3|jet2|Airbus BelugaXL
A3ST|44.8|jet2|Airbus Beluga
A343|60.3|jet4|Airbus A340-300
A346|63.5|jet4|Airbus A340-600
A359|64.8|jet2|Airbus A350-900
A35K|64.8|jet2|Airbus A350-1000
A388|79.8|jet4|Airbus A380
A400|42.4|prop|Airbus A400M
B712|28.4|jet2|Boeing 717
B733|28.9|jet2|Boeing 737-300
B734|28.9|jet2|Boeing 737-400
B735|28.9|jet2|Boeing 737-500
B736|34.3|jet2|Boeing 737-600
B737|35.8|jet2|Boeing 737-700
B738|35.8|jet2|Boeing 737-800
B739|35.8|jet2|Boeing 737-900
B37M|35.9|jet2|Boeing 737 MAX 7
B38M|35.9|jet2|Boeing 737 MAX 8
B39M|35.9|jet2|Boeing 737 MAX 9
B3XM|35.9|jet2|Boeing 737 MAX 10
B752|38.1|jet2|Boeing 757-200
B753|38.1|jet2|Boeing 757-300
B762|47.6|jet2|Boeing 767-200
B763|50.9|jet2|Boeing 767-300
B764|51.9|jet2|Boeing 767-400
B772|60.9|jet2|Boeing 777-200
B77L|64.8|jet2|Boeing 777-200LR
B773|60.9|jet2|Boeing 777-300
B77W|64.8|jet2|Boeing 777-300ER
B778|71.8|jet2|Boeing 777-8
B779|71.8|jet2|Boeing 777-9
B788|60.1|jet2|Boeing 787-8
B789|60.1|jet2|Boeing 787-9
B78X|60.1|jet2|Boeing 787-10
B742|59.6|jet4|Boeing 747-200
B744|64.4|jet4|Boeing 747-400
B748|68.4|jet4|Boeing 747-8
MD11|51.7|jet2|McDonnell Douglas MD-11
MD82|32.9|jet2|McDonnell Douglas MD-82
MD83|32.9|jet2|McDonnell Douglas MD-83
MD88|32.9|jet2|McDonnell Douglas MD-88
DC10|50.4|jet2|McDonnell Douglas DC-10
E170|26.0|jet2|Embraer 170
E75L|28.7|jet2|Embraer 175
E75S|28.7|jet2|Embraer 175
E190|28.7|jet2|Embraer 190
E195|28.7|jet2|Embraer 195
E290|33.7|jet2|Embraer E190-E2
E295|35.1|jet2|Embraer E195-E2
CRJ2|21.2|bizjet|Bombardier CRJ200
CRJ7|23.2|bizjet|Bombardier CRJ700
CRJ9|24.9|bizjet|Bombardier CRJ900
CRJX|26.2|bizjet|Bombardier CRJ1000
SU95|27.8|jet2|Sukhoi Superjet 100
C919|35.8|jet2|COMAC C919
IL96|57.7|jet4|Iljuszyn Ił-96
A124|73.3|jet4|Antonow An-124
C17|51.8|jet4|Boeing C-17 Globemaster III
C130|40.4|prop|Lockheed C-130 Hercules
C30J|40.4|prop|Lockheed C-130J Super Hercules
K35R|39.9|jet4|Boeing KC-135
A30B|44.8|jet2|Airbus A300
AT43|24.6|prop|ATR 42
AT45|24.6|prop|ATR 42-500
AT46|24.6|prop|ATR 42-600
AT72|27.1|prop|ATR 72
AT75|27.1|prop|ATR 72-500
AT76|27.1|prop|ATR 72-600
DH8A|25.9|prop|Dash 8-100
DH8C|27.4|prop|Dash 8-300
DH8D|28.4|prop|Dash 8 Q400
SF34|21.4|prop|Saab 340
SB20|24.8|prop|Saab 2000
JS41|18.3|prop|Jetstream 41
D328|21.0|prop|Dornier 328
B190|17.7|prop|Beechcraft 1900
B350|17.7|prop|Beechcraft King Air 350
BE20|16.6|prop|Beechcraft King Air 200
C208|15.9|light|Cessna 208 Caravan
PC12|16.3|light|Pilatus PC-12
L410|20.0|prop|Let L-410
C25A|15.5|bizjet|Cessna Citation CJ2
C25B|15.5|bizjet|Cessna Citation CJ3
C25C|15.5|bizjet|Cessna Citation CJ4
C510|13.2|bizjet|Cessna Citation Mustang
C525|14.4|bizjet|Cessna CitationJet
C560|16.3|bizjet|Cessna Citation V
C56X|17.0|bizjet|Cessna Citation Excel
C680|22.0|bizjet|Cessna Citation Sovereign
C68A|22.0|bizjet|Cessna Citation Latitude
C700|23.8|bizjet|Cessna Citation Longitude
C750|19.4|bizjet|Cessna Citation X
CL30|19.5|bizjet|Challenger 300
CL35|21.0|bizjet|Challenger 350
CL60|19.6|bizjet|Challenger 600
GL5T|28.6|bizjet|Global 5000
GLEX|28.6|bizjet|Global Express
GL7T|31.7|bizjet|Global 7500
G280|19.2|bizjet|Gulfstream G280
GLF4|23.7|bizjet|Gulfstream IV
GLF5|28.5|bizjet|Gulfstream V
GLF6|30.4|bizjet|Gulfstream G650
GA7C|31.4|bizjet|Gulfstream G700
FA7X|26.2|bizjet|Dassault Falcon 7X
FA8X|26.3|bizjet|Dassault Falcon 8X
F900|19.3|bizjet|Dassault Falcon 900
F2TH|21.4|bizjet|Dassault Falcon 2000
LJ35|12.0|bizjet|Learjet 35
LJ45|14.6|bizjet|Learjet 45
LJ60|13.4|bizjet|Learjet 60
E55P|15.9|bizjet|Embraer Phenom 300
E50P|12.3|bizjet|Embraer Phenom 100
E545|20.0|bizjet|Embraer Legacy 450
E550|20.0|bizjet|Embraer Praetor 600
PC24|17.0|bizjet|Pilatus PC-24
H25B|15.7|bizjet|Hawker 800
BE40|13.3|bizjet|Beechjet 400
C172|11.0|light|Cessna 172
C152|10.1|light|Cessna 152
C182|11.0|light|Cessna 182
P28A|10.7|light|Piper PA-28
SR22|11.7|light|Cirrus SR22
DA40|11.9|light|Diamond DA40
DA42|13.4|light|Diamond DA42
TBM9|12.8|light|Daher TBM 900
TBM8|12.8|light|Daher TBM 850
F16|10.0|fighter|F-16 Fighting Falcon
F35|10.7|fighter|F-35 Lightning II
EUFI|11.0|fighter|Eurofighter Typhoon
F18S|13.6|fighter|F/A-18 Super Hornet
M28|22.0|prop|PZL M28 Skytruck
`;

const DB = new Map<string, TypeInfo>();
for (const line of RAW.trim().split('\n')) {
  const [code, span, form, name] = line.split('|');
  DB.set(code, { span: parseFloat(span), form: form as Planform, name });
}

const CATEGORY_DEFAULT: Record<string, { span: number; form: Planform }> = {
  A1: { span: 11, form: 'light' },
  A2: { span: 20, form: 'bizjet' },
  A3: { span: 34, form: 'jet2' },
  A4: { span: 38, form: 'jet2' },
  A5: { span: 62, form: 'jet2' },
  A6: { span: 10, form: 'fighter' },
  A7: { span: 11, form: 'heli' },
  B1: { span: 15, form: 'light' },
  B2: { span: 30, form: 'light' },
};

/** `name` is empty when only the ADS-B category is known – the UI then shows a translated category. */
export function typeInfo(type: string | undefined, category?: string): TypeInfo & { cat: string } {
  const cat = category && CATEGORY_DEFAULT[category] ? category : '';
  if (type) {
    const t = DB.get(type.toUpperCase());
    if (t) return { ...t, cat };
    if (/^(EC|AS|H1|H6|R44|R22|B06|B407|A109|A139|A169|S76|EH10|NH90|MI8|UH60|H60|EC35|EC45|EC30)/.test(type)) {
      return { span: 11, form: 'heli', name: type, cat: 'A7' };
    }
  }
  if (cat) return { ...CATEGORY_DEFAULT[cat], name: type || '', cat };
  return { span: 33, form: 'jet2', name: type || '', cat };
}

// Planform silhouettes (100×100 box, nose up)
export const PLANFORM_PATHS: Record<Planform, string> = {
  jet2:
    'M50 2.5c2.3 0 3.6 3.2 3.9 8.6l.2 28.4 17.6 9.7v-3.3l3.6-.1v5.4l19.2 10.6v5.2L54.3 54.8 53.9 80l11.6 9.4v4.3l-13.4-3.1-.9 6.4h-2.4l-.9-6.4-13.4 3.1v-4.3L46.1 80l-.4-25.2-40.2 12.2v-5.2l19.2-10.6v-5.4l3.6.1v3.3l17.6-9.7.2-28.4c.3-5.4 1.6-8.6 3.9-8.6z',
  jet4:
    'M50 2c2.4 0 3.8 3.4 4.1 9.2l.2 26.8 9.2 5.2v-3.6h3.2v5.4l8.8 4.9v-3.6h3.2v5.4l13.8 7.8v5.6L54.4 54.4 54 79l12.5 9.6v4.6l-14.3-3.3-1 6.6h-2.4l-1-6.6-14.3 3.3v-4.6L46 79l-.4-24.6-42.1 10.7v-5.6l13.8-7.8v-5.4h3.2v3.6l8.8-4.9v-5.4h3.2v3.6l9.2-5.2.2-26.8C42.2 5.4 43.6 2 46 2z',
  prop:
    'M50 4c2 0 3.2 2.6 3.4 7l.2 22.6h12.2v-4.4h3.4v4.4h28v6.2l-43.6 3.2-.2 33.4 11 3.8v5.2l-11.6-.8-.8 7.4h-2.6l-.8-7.4-11.6.8v-5.2l11-3.8-.2-33.4L2.8 39.8v-6.2h28v-4.4h3.4v4.4h12.2l.2-22.6C46.8 6.6 48 4 50 4z',
  bizjet:
    'M50 4c2.2 0 3.4 3.8 3.6 9l.2 30 25 10.2v4.8l-24.8-4-.2 14.4 3.6 1.4v7.4l-3.6-1.2-.4 6 13.6 4.6v4.4l-15.6-1.4-.8 4.4h-1.2l-.8-4.4-15.6 1.4v-4.4L46.6 82l-.4-6-3.6 1.2v-7.4l3.6-1.4-.2-14.4-24.8 4v-4.8l25-10.2.2-30C46.6 7.8 47.8 4 50 4z',
  light:
    'M50 8c1.8 0 2.8 2.2 3 5.4l.2 16.6h45v6.6l-45 2.4-.2 38.4 14 2.4v5.4l-14.6.4-.8 6.4h-3.2l-.8-6.4-14.6-.4v-5.4l14-2.4-.2-38.4-45-2.4V30h45l.2-16.6C47.2 10.2 48.2 8 50 8z',
  heli:
    'M50 1a49 49 0 1 1 0 98 49 49 0 0 1 0-98zm0 3.4a45.6 45.6 0 1 0 0 91.2 45.6 45.6 0 0 0 0-91.2zM50 26c5.8 0 9 5.6 9 13.4 0 8.4-3.6 14-6.6 15.4l-.8 30h6.2v4.4h-6.4l-.2 3.2h-2.4l-.2-3.2h-6.4v-4.4h6.2l-.8-30c-3-1.4-6.6-7-6.6-15.4C41 31.6 44.2 26 50 26z',
  fighter:
    'M50 1c1.8 0 3 4 3.4 10.4l.8 24.6 6.2 6.4 33.4 20.4v7.4l-30.2-6-6.6 1-.4 14.6 14 7.6v6.2L56 90.2 54.6 99h-9.2L44 90.2l-14.6 3.4v-6.2l14-7.6-.4-14.6-6.6-1-30.2 6v-7.4l33.4-20.4 6.2-6.4.8-24.6C47 5 48.2 1 50 1z',
};
