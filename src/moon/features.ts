// Selected lunar features (IAU names, Polish common names). lat/lon in degrees, east positive.
export interface LunarFeature {
  name: string;
  pl?: string;
  lat: number;
  lon: number;
  kind: 'mare' | 'crater' | 'site';
  size: number;
}

export const FEATURES: LunarFeature[] = [
  { name: 'Oceanus Procellarum', pl: 'Ocean Burz', lat: 18.4, lon: -57.4, kind: 'mare', size: 3 },
  { name: 'Mare Imbrium', pl: 'Morze Deszczów', lat: 32.8, lon: -15.6, kind: 'mare', size: 3 },
  { name: 'Mare Serenitatis', pl: 'Morze Jasności', lat: 28.0, lon: 17.5, kind: 'mare', size: 2 },
  { name: 'Mare Tranquillitatis', pl: 'Morze Spokoju', lat: 8.5, lon: 31.4, kind: 'mare', size: 2 },
  { name: 'Mare Crisium', pl: 'Morze Przesileń', lat: 17.0, lon: 59.1, kind: 'mare', size: 2 },
  { name: 'Mare Fecunditatis', pl: 'Morze Żyzności', lat: -7.8, lon: 51.3, kind: 'mare', size: 2 },
  { name: 'Mare Nectaris', pl: 'Morze Nektaru', lat: -15.2, lon: 35.5, kind: 'mare', size: 1 },
  { name: 'Mare Nubium', pl: 'Morze Chmur', lat: -21.3, lon: -16.6, kind: 'mare', size: 2 },
  { name: 'Mare Humorum', pl: 'Morze Wilgoci', lat: -24.4, lon: -38.6, kind: 'mare', size: 1 },
  { name: 'Mare Frigoris', pl: 'Morze Zimna', lat: 56.0, lon: 1.4, kind: 'mare', size: 2 },
  { name: 'Mare Vaporum', pl: 'Morze Par', lat: 13.3, lon: 3.6, kind: 'mare', size: 1 },
  { name: 'Mare Cognitum', pl: 'Morze Poznane', lat: -10.0, lon: -23.1, kind: 'mare', size: 1 },
  { name: 'Sinus Iridum', pl: 'Zatoka Tęczy', lat: 44.1, lon: -31.5, kind: 'mare', size: 1 },
  { name: 'Mare Orientale', pl: 'Morze Wschodnie', lat: -19.4, lon: -92.8, kind: 'mare', size: 1 },
  { name: 'Mare Smythii', pl: 'Morze Smytha', lat: 1.3, lon: 87.5, kind: 'mare', size: 1 },
  { name: 'Mare Moscoviense', pl: 'Morze Moskiewskie', lat: 27.3, lon: 147.9, kind: 'mare', size: 1 },
  { name: 'Tycho', lat: -43.3, lon: -11.2, kind: 'crater', size: 2 },
  { name: 'Copernicus', pl: 'Kopernik', lat: 9.6, lon: -20.1, kind: 'crater', size: 2 },
  { name: 'Kepler', lat: 8.1, lon: -38.0, kind: 'crater', size: 1 },
  { name: 'Aristarchus', pl: 'Arystarch', lat: 23.7, lon: -47.4, kind: 'crater', size: 1 },
  { name: 'Plato', pl: 'Platon', lat: 51.6, lon: -9.4, kind: 'crater', size: 1 },
  { name: 'Clavius', lat: -58.4, lon: -14.4, kind: 'crater', size: 1 },
  { name: 'Ptolemaeus', pl: 'Ptolemeusz', lat: -9.3, lon: -1.9, kind: 'crater', size: 1 },
  { name: 'Archimedes', lat: 29.7, lon: -4.0, kind: 'crater', size: 1 },
  { name: 'Grimaldi', lat: -5.2, lon: -68.6, kind: 'crater', size: 1 },
  { name: 'Langrenus', lat: -8.9, lon: 61.0, kind: 'crater', size: 1 },
  { name: 'Petavius', pl: 'Petawiusz', lat: -25.1, lon: 60.4, kind: 'crater', size: 1 },
  { name: 'Theophilus', pl: 'Teofil', lat: -11.4, lon: 26.4, kind: 'crater', size: 1 },
  { name: 'Posidonius', lat: 31.8, lon: 29.9, kind: 'crater', size: 1 },
  { name: 'Gassendi', lat: -17.6, lon: -40.1, kind: 'crater', size: 1 },
  { name: 'Schickard', lat: -44.3, lon: -54.6, kind: 'crater', size: 1 },
  { name: 'Apollo 11', pl: 'Lądowanie 1969', lat: 0.674, lon: 23.473, kind: 'site', size: 1 },
  { name: 'Apollo 12', lat: -3.012, lon: -23.422, kind: 'site', size: 1 },
  { name: 'Apollo 14', lat: -3.645, lon: -17.471, kind: 'site', size: 1 },
  { name: 'Apollo 15', lat: 26.132, lon: 3.634, kind: 'site', size: 1 },
  { name: 'Apollo 16', lat: -8.973, lon: 15.498, kind: 'site', size: 1 },
  { name: 'Apollo 17', lat: 20.191, lon: 30.772, kind: 'site', size: 1 },
];
