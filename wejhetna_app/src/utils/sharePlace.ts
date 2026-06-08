import { Platform, Share } from "react-native";
import type { PlaceForMap } from "../api/places";
import i18n from "../i18n";

function getLocalizedPlaceName(place: PlaceForMap): string {
  const lang = i18n.language || "ar";
  if (lang === "he" && place.name_he) return place.name_he;
  if (lang === "ar" && place.name_ar) return place.name_ar;
  return place.name || place.name_he || place.name_ar || "";
}

function getLocalizedCityName(place: PlaceForMap): string {
  const city = place.city;
  if (!city) return "";
  const lang = i18n.language || "ar";
  if (lang === "he" && city.name_he) return city.name_he;
  if (lang === "ar" && city.name_ar) return city.name_ar;
  return city.name_en || city.name_ar || city.name_he || "";
}

/** Open the native share sheet for any place (business or public service). */
export async function sharePlace(place: PlaceForMap): Promise<void> {
  const name = getLocalizedPlaceName(place);
  const cityName = getLocalizedCityName(place);
  const { lat, lon } = place.location;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

  const lines = [name];
  if (cityName) lines.push(cityName);
  if (place.phone?.trim()) lines.push(place.phone.trim());
  lines.push(mapsUrl);

  const message = lines.join("\n");

  await Share.share(
    Platform.OS === "ios"
      ? { message, url: mapsUrl, title: name }
      : { message, title: name }
  );
}
