"""
Argentine Spatio-Temporal Gazetteer & Entity Resolution (NER).

Maps Argentine landmarks, neighborhoods, cities, and provinces to exact coordinates
[lat, lon] and precision-7 Geohashes for spatio-temporal anchoring.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import re
import unicodedata

from strata.core.geo import get_geohash


def normalize_text(text: str) -> str:
    """
    Normalizes text for accent-insensitive and case-insensitive comparison.
    Example: 'Córdoba' -> 'cordoba', 'Núñez' -> 'nunez'.
    """
    nfkd = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in nfkd if not unicodedata.combining(c))
    return stripped.lower()


@dataclass(frozen=True)
class GazetteerEntry:
    name: str
    category: str  # landmark, neighborhood, city, province
    lat: float
    lon: float
    geohash: str
    province: str
    aliases: list[str] = field(default_factory=list)
    priority: int = 10  # higher priority preferred in resolution conflict


@dataclass
class ResolvedLocation:
    name: str
    category: str
    lat: float
    lon: float
    geohash: str
    province: str
    matched_term: str
    confidence: float

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "category": self.category,
            "lat": self.lat,
            "lon": self.lon,
            "geohash": self.geohash,
            "province": self.province,
            "matched_term": self.matched_term,
            "confidence": self.confidence,
        }


# Default fallback: Obelisco / CABA center
DEFAULT_ARGENTINA_LOCATION = GazetteerEntry(
    name="Buenos Aires",
    category="city",
    lat=-34.6037,
    lon=-58.3816,
    geohash=get_geohash(-34.6037, -58.3816, 7),
    province="Ciudad Autónoma de Buenos Aires",
    aliases=["caba", "capital federal", "ciudad de buenos aires"],
    priority=15,
)


ARGENTINE_GAZETTEER_RAW_DATA: list[dict] = [
    # --- LANDMARKS / POIs (Priority 40) ---
    {
        "name": "Obelisco",
        "category": "landmark",
        "lat": -34.6037,
        "lon": -58.3816,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["obelisco de buenos aires", "9 de julio y corrientes", "el obelisco"],
        "priority": 40,
    },
    {
        "name": "Plaza de Mayo",
        "category": "landmark",
        "lat": -34.6083,
        "lon": -58.3712,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["plaza mayo", "la plaza de mayo"],
        "priority": 40,
    },
    {
        "name": "Casa Rosada",
        "category": "landmark",
        "lat": -34.6080,
        "lon": -58.3703,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["casa de gobierno", "casa rosada presidencial"],
        "priority": 40,
    },
    {
        "name": "Congreso de la Nación",
        "category": "landmark",
        "lat": -34.6099,
        "lon": -58.3926,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["congreso nacional", "palacio del congreso", "el congreso"],
        "priority": 40,
    },
    {
        "name": "Teatro Colón",
        "category": "landmark",
        "lat": -34.6011,
        "lon": -58.3831,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["teatro colon", "el colon"],
        "priority": 40,
    },
    {
        "name": "Puente de la Mujer",
        "category": "landmark",
        "lat": -34.6074,
        "lon": -58.3653,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["puente de la mujer"],
        "priority": 40,
    },
    {
        "name": "Cementerio de la Recoleta",
        "category": "landmark",
        "lat": -34.5878,
        "lon": -58.3928,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["cementerio recoleta"],
        "priority": 40,
    },
    {
        "name": "Estadio Monumental",
        "category": "landmark",
        "lat": -34.5453,
        "lon": -58.4498,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["monumental de river", "estadio river plate", "el monumental"],
        "priority": 40,
    },
    {
        "name": "La Bombonera",
        "category": "landmark",
        "lat": -34.6356,
        "lon": -58.3647,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["estadio boca juniors", "la bombonera boca", "bombonera"],
        "priority": 40,
    },
    {
        "name": "Monumento a la Bandera",
        "category": "landmark",
        "lat": -32.9477,
        "lon": -60.6303,
        "province": "Santa Fe",
        "aliases": ["monumento nacional a la bandera", "monumento bandera rosario"],
        "priority": 40,
    },
    {
        "name": "Cataratas del Iguazú",
        "category": "landmark",
        "lat": -25.6953,
        "lon": -54.4367,
        "province": "Misiones",
        "aliases": ["cataratas del iguazu", "parque nacional iguazu", "cataratas iguazu"],
        "priority": 40,
    },
    {
        "name": "Glaciar Perito Moreno",
        "category": "landmark",
        "lat": -50.4950,
        "lon": -73.1378,
        "province": "Santa Cruz",
        "aliases": ["glaciar perito moreno", "perito moreno glacier"],
        "priority": 40,
    },
    {
        "name": "Cerro Catedral",
        "category": "landmark",
        "lat": -41.1706,
        "lon": -71.4397,
        "province": "Río Negro",
        "aliases": ["cerro catedral bariloche"],
        "priority": 40,
    },
    {
        "name": "Aconcagua",
        "category": "landmark",
        "lat": -32.6532,
        "lon": -70.0109,
        "province": "Mendoza",
        "aliases": ["cerro aconcagua", "parque provincial aconcagua"],
        "priority": 40,
    },
    # --- CABA NEIGHBORHOODS (Priority 30) ---
    {
        "name": "Palermo",
        "category": "neighborhood",
        "lat": -34.5786,
        "lon": -58.4267,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["palermo soho", "palermo hollywood", "palermo chico", "barrio palermo"],
        "priority": 30,
    },
    {
        "name": "Recoleta",
        "category": "neighborhood",
        "lat": -34.5885,
        "lon": -58.3927,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio recoleta"],
        "priority": 30,
    },
    {
        "name": "San Telmo",
        "category": "neighborhood",
        "lat": -34.6212,
        "lon": -58.3731,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio san telmo"],
        "priority": 30,
    },
    {
        "name": "Retiro",
        "category": "neighborhood",
        "lat": -34.5916,
        "lon": -58.3753,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["estacion retiro", "plaza san martin retiro", "barrio retiro"],
        "priority": 30,
    },
    {
        "name": "Puerto Madero",
        "category": "neighborhood",
        "lat": -34.6118,
        "lon": -58.3636,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["diques de puerto madero"],
        "priority": 30,
    },
    {
        "name": "La Boca",
        "category": "neighborhood",
        "lat": -34.6345,
        "lon": -58.3631,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio de la boca", "caminito"],
        "priority": 30,
    },
    {
        "name": "Belgrano",
        "category": "neighborhood",
        "lat": -34.5627,
        "lon": -58.4564,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio belgrano", "belgrano r", "belgrano c", "barrancas de belgrano"],
        "priority": 30,
    },
    {
        "name": "Caballito",
        "category": "neighborhood",
        "lat": -34.6200,
        "lon": -58.4410,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["parque rivadavia", "primera junta caballito"],
        "priority": 30,
    },
    {
        "name": "Almagro",
        "category": "neighborhood",
        "lat": -34.6089,
        "lon": -58.4214,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio almagro"],
        "priority": 30,
    },
    {
        "name": "Monserrat",
        "category": "neighborhood",
        "lat": -34.6133,
        "lon": -58.3822,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio monserrat"],
        "priority": 30,
    },
    {
        "name": "Constitución",
        "category": "neighborhood",
        "lat": -34.6277,
        "lon": -58.3814,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["constitucion", "estacion constitucion", "plaza constitucion"],
        "priority": 30,
    },
    {
        "name": "Balvanera",
        "category": "neighborhood",
        "lat": -34.6090,
        "lon": -58.4050,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["once", "plaza miserere", "plaza once"],
        "priority": 30,
    },
    {
        "name": "Villa Crespo",
        "category": "neighborhood",
        "lat": -34.5997,
        "lon": -58.4442,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio villa crespo"],
        "priority": 30,
    },
    {
        "name": "Colegiales",
        "category": "neighborhood",
        "lat": -34.5750,
        "lon": -58.4500,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio colegiales"],
        "priority": 30,
    },
    {
        "name": "Núñez",
        "category": "neighborhood",
        "lat": -34.5450,
        "lon": -58.4650,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["nunez", "barrio nunez"],
        "priority": 30,
    },
    {
        "name": "Chacarita",
        "category": "neighborhood",
        "lat": -34.5880,
        "lon": -58.4550,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio chacarita"],
        "priority": 30,
    },
    {
        "name": "Villa Urquiza",
        "category": "neighborhood",
        "lat": -34.5714,
        "lon": -58.4878,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio villa urquiza"],
        "priority": 30,
    },
    {
        "name": "Villa Devoto",
        "category": "neighborhood",
        "lat": -34.5986,
        "lon": -58.5133,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio villa devoto"],
        "priority": 30,
    },
    {
        "name": "Flores",
        "category": "neighborhood",
        "lat": -34.6300,
        "lon": -58.4633,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio de flores", "plaza flores"],
        "priority": 30,
    },
    {
        "name": "Barracas",
        "category": "neighborhood",
        "lat": -34.6400,
        "lon": -58.3800,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["barrio barracas"],
        "priority": 30,
    },
    {
        "name": "Liniers",
        "category": "neighborhood",
        "lat": -34.6400,
        "lon": -58.5150,
        "province": "Ciudad Autónoma de Buenos Aires",
        "aliases": ["estacion liniers", "barrio liniers"],
        "priority": 30,
    },
    # --- GRAN BUENOS AIRES / AMBA LOCALITIES (Priority 25) ---
    {
        "name": "Vicente López",
        "category": "city",
        "lat": -34.5292,
        "lon": -58.4716,
        "province": "Buenos Aires",
        "aliases": ["vicente lopez", "olivos"],
        "priority": 25,
    },
    {
        "name": "San Isidro",
        "category": "city",
        "lat": -34.4722,
        "lon": -58.5283,
        "province": "Buenos Aires",
        "aliases": ["partido de san isidro"],
        "priority": 25,
    },
    {
        "name": "Tigre",
        "category": "city",
        "lat": -34.4260,
        "lon": -58.5796,
        "province": "Buenos Aires",
        "aliases": ["delta del tigre", "puerto de frutos tigre"],
        "priority": 25,
    },
    {
        "name": "Avellaneda",
        "category": "city",
        "lat": -34.6611,
        "lon": -58.3667,
        "province": "Buenos Aires",
        "aliases": ["partido de avellaneda"],
        "priority": 25,
    },
    {
        "name": "Quilmes",
        "category": "city",
        "lat": -34.7214,
        "lon": -58.2542,
        "province": "Buenos Aires",
        "aliases": ["partido de quilmes", "bernal"],
        "priority": 25,
    },
    {
        "name": "La Matanza",
        "category": "city",
        "lat": -34.7708,
        "lon": -58.6253,
        "province": "Buenos Aires",
        "aliases": ["san justo", "ramos mejia", "partido de la matanza"],
        "priority": 25,
    },
    {
        "name": "Morón",
        "category": "city",
        "lat": -34.6533,
        "lon": -58.6197,
        "province": "Buenos Aires",
        "aliases": ["moron", "haedo", "castelar"],
        "priority": 25,
    },
    {
        "name": "Lomas de Zamora",
        "category": "city",
        "lat": -34.7600,
        "lon": -58.4000,
        "province": "Buenos Aires",
        "aliases": ["banfield", "temperley"],
        "priority": 25,
    },
    # --- MAJOR CITIES & PROVINCIAL CAPITALS (Priority 20) ---
    {
        "name": "La Plata",
        "category": "city",
        "lat": -34.9215,
        "lon": -57.9545,
        "province": "Buenos Aires",
        "aliases": ["ciudad de la plata", "capital bonaerense"],
        "priority": 20,
    },
    {
        "name": "Mar del Plata",
        "category": "city",
        "lat": -38.0055,
        "lon": -57.5562,
        "province": "Buenos Aires",
        "aliases": ["la feliz", "mar del plata mardel"],
        "priority": 20,
    },
    {
        "name": "Bahía Blanca",
        "category": "city",
        "lat": -38.7183,
        "lon": -62.2663,
        "province": "Buenos Aires",
        "aliases": ["bahia blanca"],
        "priority": 20,
    },
    {
        "name": "Tandil",
        "category": "city",
        "lat": -37.3217,
        "lon": -59.1332,
        "province": "Buenos Aires",
        "aliases": ["ciudad de tandil", "sierras de tandil"],
        "priority": 20,
    },
    {
        "name": "Rosario",
        "category": "city",
        "lat": -32.9468,
        "lon": -60.6393,
        "province": "Santa Fe",
        "aliases": ["ciudad de rosario", "gran rosario"],
        "priority": 20,
    },
    {
        "name": "Santa Fe",
        "category": "city",
        "lat": -31.6333,
        "lon": -60.7000,
        "province": "Santa Fe",
        "aliases": ["santa fe de la vera cruz", "capital de santa fe", "ciudad de santa fe"],
        "priority": 20,
    },
    {
        "name": "Córdoba",
        "category": "city",
        "lat": -31.4201,
        "lon": -64.1888,
        "province": "Córdoba",
        "aliases": ["cordoba capital", "ciudad de cordoba", "la docta"],
        "priority": 20,
    },
    {
        "name": "Villa Carlos Paz",
        "category": "city",
        "lat": -31.4241,
        "lon": -64.4978,
        "province": "Córdoba",
        "aliases": ["carlos paz"],
        "priority": 20,
    },
    {
        "name": "Río Cuarto",
        "category": "city",
        "lat": -33.1307,
        "lon": -64.3499,
        "province": "Córdoba",
        "aliases": ["rio cuarto"],
        "priority": 20,
    },
    {
        "name": "Mendoza",
        "category": "city",
        "lat": -32.8895,
        "lon": -68.8458,
        "province": "Mendoza",
        "aliases": ["ciudad de mendoza", "gran mendoza", "capital mendocina"],
        "priority": 20,
    },
    {
        "name": "San Rafael",
        "category": "city",
        "lat": -34.6177,
        "lon": -68.3301,
        "province": "Mendoza",
        "aliases": ["canon del atuel san rafael"],
        "priority": 20,
    },
    {
        "name": "Bariloche",
        "category": "city",
        "lat": -41.1335,
        "lon": -71.3103,
        "province": "Río Negro",
        "aliases": ["san carlos de bariloche", "bariloche rio negro"],
        "priority": 20,
    },
    {
        "name": "San Martín de los Andes",
        "category": "city",
        "lat": -40.1579,
        "lon": -71.3533,
        "province": "Neuquén",
        "aliases": ["san martin de los andes", "sma neuquen"],
        "priority": 20,
    },
    {
        "name": "Neuquén",
        "category": "city",
        "lat": -38.9516,
        "lon": -68.0591,
        "province": "Neuquén",
        "aliases": ["neuquen capital", "ciudad de neuquen"],
        "priority": 20,
    },
    {
        "name": "Salta",
        "category": "city",
        "lat": -24.7859,
        "lon": -65.4117,
        "province": "Salta",
        "aliases": ["salta capital", "ciudad de salta", "salta la linda"],
        "priority": 20,
    },
    {
        "name": "San Salvador de Jujuy",
        "category": "city",
        "lat": -24.1858,
        "lon": -65.2995,
        "province": "Jujuy",
        "aliases": ["jujuy capital", "san salvador de jujuy", "ciudad de jujuy"],
        "priority": 20,
    },
    {
        "name": "San Miguel de Tucumán",
        "category": "city",
        "lat": -26.8083,
        "lon": -65.2176,
        "province": "Tucumán",
        "aliases": ["tucuman capital", "san miguel de tucuman", "ciudad de tucuman"],
        "priority": 20,
    },
    {
        "name": "Corrientes",
        "category": "city",
        "lat": -27.4678,
        "lon": -58.8344,
        "province": "Corrientes",
        "aliases": ["corrientes capital", "ciudad de corrientes"],
        "priority": 20,
    },
    {
        "name": "Posadas",
        "category": "city",
        "lat": -27.3621,
        "lon": -55.8967,
        "province": "Misiones",
        "aliases": ["posadas misiones", "capital misionera"],
        "priority": 20,
    },
    {
        "name": "Puerto Iguazú",
        "category": "city",
        "lat": -25.5991,
        "lon": -54.5735,
        "province": "Misiones",
        "aliases": ["puerto iguazu"],
        "priority": 20,
    },
    {
        "name": "Resistencia",
        "category": "city",
        "lat": -27.4514,
        "lon": -58.9867,
        "province": "Chaco",
        "aliases": ["resistencia chaco", "capital de chaco"],
        "priority": 20,
    },
    {
        "name": "Formosa",
        "category": "city",
        "lat": -26.1775,
        "lon": -58.1781,
        "province": "Formosa",
        "aliases": ["ciudad de formosa", "formosa capital"],
        "priority": 20,
    },
    {
        "name": "Santiago del Estero",
        "category": "city",
        "lat": -27.7951,
        "lon": -64.2615,
        "province": "Santiago del Estero",
        "aliases": ["santiago del estero capital", "madre de ciudades"],
        "priority": 20,
    },
    {
        "name": "San Fernando del Valle de Catamarca",
        "category": "city",
        "lat": -28.4696,
        "lon": -65.7852,
        "province": "Catamarca",
        "aliases": ["catamarca capital", "san fernando del valle"],
        "priority": 20,
    },
    {
        "name": "La Rioja",
        "category": "city",
        "lat": -29.4135,
        "lon": -66.8558,
        "province": "La Rioja",
        "aliases": ["la rioja capital", "ciudad de la rioja"],
        "priority": 20,
    },
    {
        "name": "San Juan",
        "category": "city",
        "lat": -31.5375,
        "lon": -68.5364,
        "province": "San Juan",
        "aliases": ["san juan capital", "ciudad de san juan"],
        "priority": 20,
    },
    {
        "name": "San Luis",
        "category": "city",
        "lat": -33.2950,
        "lon": -66.3356,
        "province": "San Luis",
        "aliases": ["san luis capital", "ciudad de san luis"],
        "priority": 20,
    },
    {
        "name": "Santa Rosa",
        "category": "city",
        "lat": -36.6167,
        "lon": -64.2833,
        "province": "La Pampa",
        "aliases": ["santa rosa la pampa", "capital pampeana"],
        "priority": 20,
    },
    {
        "name": "Viedma",
        "category": "city",
        "lat": -40.8135,
        "lon": -62.9967,
        "province": "Río Negro",
        "aliases": ["viedma rio negro", "capital rionegrina"],
        "priority": 20,
    },
    {
        "name": "Rawson",
        "category": "city",
        "lat": -43.3002,
        "lon": -65.1023,
        "province": "Chubut",
        "aliases": ["rawson chubut"],
        "priority": 20,
    },
    {
        "name": "Puerto Madryn",
        "category": "city",
        "lat": -42.7692,
        "lon": -65.0385,
        "province": "Chubut",
        "aliases": ["madryn", "puerto madryn chubut"],
        "priority": 20,
    },
    {
        "name": "Comodoro Rivadavia",
        "category": "city",
        "lat": -45.8667,
        "lon": -67.5000,
        "province": "Chubut",
        "aliases": ["comodoro", "comodoro rivadavia chubut"],
        "priority": 20,
    },
    {
        "name": "Río Gallegos",
        "category": "city",
        "lat": -51.6226,
        "lon": -69.2181,
        "province": "Santa Cruz",
        "aliases": ["rio gallegos", "capital santacrucena"],
        "priority": 20,
    },
    {
        "name": "El Calafate",
        "category": "city",
        "lat": -50.3379,
        "lon": -72.2648,
        "province": "Santa Cruz",
        "aliases": ["calafate", "el calafate"],
        "priority": 20,
    },
    {
        "name": "Ushuaia",
        "category": "city",
        "lat": -54.8019,
        "lon": -68.3030,
        "province": "Tierra del Fuego",
        "aliases": ["ciudad del fin del mundo", "ushuaia tierra del fuego"],
        "priority": 20,
    },
    # --- PROVINCES (Priority 10) ---
    {"name": "Buenos Aires", "category": "province", "lat": -36.6769, "lon": -60.5588, "province": "Buenos Aires", "aliases": ["provincia de buenos aires", "bonaerense", "pba"], "priority": 10},
    {"name": "Catamarca", "category": "province", "lat": -28.4696, "lon": -65.7852, "province": "Catamarca", "aliases": ["provincia de catamarca", "catamarquena"], "priority": 10},
    {"name": "Chaco", "category": "province", "lat": -27.4514, "lon": -58.9867, "province": "Chaco", "aliases": ["provincia del chaco", "chaquena"], "priority": 10},
    {"name": "Chubut", "category": "province", "lat": -43.3002, "lon": -65.1023, "province": "Chubut", "aliases": ["provincia del chubut", "chubutense"], "priority": 10},
    {"name": "Córdoba", "category": "province", "lat": -31.4201, "lon": -64.1888, "province": "Córdoba", "aliases": ["provincia de cordoba", "cordobesa"], "priority": 10},
    {"name": "Corrientes", "category": "province", "lat": -27.4678, "lon": -58.8344, "province": "Corrientes", "aliases": ["provincia de corrientes", "correntina"], "priority": 10},
    {"name": "Entre Ríos", "category": "province", "lat": -32.0589, "lon": -59.2014, "province": "Entre Ríos", "aliases": ["entre rios", "provincia de entre rios", "entrerriana", "parana"], "priority": 10},
    {"name": "Formosa", "category": "province", "lat": -26.1775, "lon": -58.1781, "province": "Formosa", "aliases": ["provincia de formosa", "formosena"], "priority": 10},
    {"name": "Jujuy", "category": "province", "lat": -24.1858, "lon": -65.2995, "province": "Jujuy", "aliases": ["provincia de jujuy", "jujena"], "priority": 10},
    {"name": "La Pampa", "category": "province", "lat": -36.6167, "lon": -64.2833, "province": "La Pampa", "aliases": ["provincia de la pampa", "pampeana"], "priority": 10},
    {"name": "La Rioja", "category": "province", "lat": -29.4135, "lon": -66.8558, "province": "La Rioja", "aliases": ["provincia de la rioja", "riojana"], "priority": 10},
    {"name": "Mendoza", "category": "province", "lat": -32.8895, "lon": -68.8458, "province": "Mendoza", "aliases": ["provincia de mendoza", "mendocina"], "priority": 10},
    {"name": "Misiones", "category": "province", "lat": -27.3621, "lon": -55.8967, "province": "Misiones", "aliases": ["provincia de misiones", "misionera"], "priority": 10},
    {"name": "Neuquén", "category": "province", "lat": -38.9516, "lon": -68.0591, "province": "Neuquén", "aliases": ["provincia del neuquen", "neuquina"], "priority": 10},
    {"name": "Río Negro", "category": "province", "lat": -40.8135, "lon": -62.9967, "province": "Río Negro", "aliases": ["rio negro", "provincia de rio negro", "rionegrina"], "priority": 10},
    {"name": "Salta", "category": "province", "lat": -24.7859, "lon": -65.4117, "province": "Salta", "aliases": ["provincia de salta", "saltena"], "priority": 10},
    {"name": "San Juan", "category": "province", "lat": -31.5375, "lon": -68.5364, "province": "San Juan", "aliases": ["provincia de san juan", "sanjuanina"], "priority": 10},
    {"name": "San Luis", "category": "province", "lat": -33.2950, "lon": -66.3356, "province": "San Luis", "aliases": ["provincia de san luis", "puntana"], "priority": 10},
    {"name": "Santa Cruz", "category": "province", "lat": -51.6226, "lon": -69.2181, "province": "Santa Cruz", "aliases": ["provincia de santa cruz", "santacrucena"], "priority": 10},
    {"name": "Santa Fe", "category": "province", "lat": -31.6333, "lon": -60.7000, "province": "Santa Fe", "aliases": ["provincia de santa fe", "santafesina"], "priority": 10},
    {"name": "Santiago del Estero", "category": "province", "lat": -27.7951, "lon": -64.2615, "province": "Santiago del Estero", "aliases": ["provincia de santiago del estero", "santiaguena"], "priority": 10},
    {"name": "Tierra del Fuego", "category": "province", "lat": -54.8019, "lon": -68.3030, "province": "Tierra del Fuego", "aliases": ["tierra del fuego", "islas del atlantico sur", "fueguina"], "priority": 10},
    {"name": "Tucumán", "category": "province", "lat": -26.8083, "lon": -65.2176, "province": "Tucumán", "aliases": ["tucuman", "provincia de tucuman", "tucumana"], "priority": 10},
]


class ArgentineGazetteer:
    """
    Argentine Gazetteer and Spatio-Temporal Entity Resolver.
    Recognizes geographic locations in news texts and maps them to coordinates & Geohashes.
    """

    def __init__(self, custom_entries: list[GazetteerEntry] | None = None):
        self.entries: list[GazetteerEntry] = []
        self._term_to_entry: dict[str, GazetteerEntry] = {}

        # Load built-in data
        for item in ARGENTINE_GAZETTEER_RAW_DATA:
            entry = GazetteerEntry(
                name=item["name"],
                category=item["category"],
                lat=item["lat"],
                lon=item["lon"],
                geohash=get_geohash(item["lat"], item["lon"], 7),
                province=item["province"],
                aliases=item.get("aliases", []),
                priority=item.get("priority", 10),
            )
            self._register(entry)

        if custom_entries:
            for entry in custom_entries:
                self._register(entry)

        # Build regex patterns sorted by term length descending (longest match first)
        self._compile_patterns()

    def _register(self, entry: GazetteerEntry):
        self.entries.append(entry)
        norm_name = normalize_text(entry.name)
        self._term_to_entry[norm_name] = entry
        for alias in entry.aliases:
            norm_alias = normalize_text(alias)
            self._term_to_entry[norm_alias] = entry

    def _compile_patterns(self):
        """Compiles regex patterns matching terms with word boundaries."""
        # Sort terms by length descending so multi-word terms match before single words
        terms = sorted(self._term_to_entry.keys(), key=lambda t: len(t), reverse=True)
        # Group into word boundary regex
        escaped_terms = [re.escape(t) for t in terms]
        self._pattern = re.compile(
            r"\b(" + "|".join(escaped_terms) + r")\b", re.IGNORECASE
        )

    def resolve(
        self,
        headline: str,
        body: str = "",
        fallback_to_default: bool = True,
    ) -> ResolvedLocation | None:
        """
        Resolves the most prominent geographic entity mentioned in headline and/or body.
        Gives highest confidence to specific landmarks and neighborhoods, and headline mentions.
        """
        candidates: list[tuple[float, GazetteerEntry, str]] = []

        norm_headline = normalize_text(headline)
        norm_body = normalize_text(body)

        # 1. Search in headline (weighted heavily)
        for match in self._pattern.finditer(norm_headline):
            term = match.group(1)
            entry = self._term_to_entry.get(term)
            if entry:
                # Score formula: priority + length bonus + headline bonus (+100)
                score = 100.0 + entry.priority + (len(term) * 0.5)
                candidates.append((score, entry, term))

        # 2. Search in body if no high-priority match yet
        for match in self._pattern.finditer(norm_body):
            term = match.group(1)
            entry = self._term_to_entry.get(term)
            if entry:
                score = entry.priority + (len(term) * 0.5)
                candidates.append((score, entry, term))

        if candidates:
            # Sort by highest score
            candidates.sort(key=lambda c: c[0], reverse=True)
            best_score, best_entry, matched_term = candidates[0]
            confidence = min(1.0, best_score / 150.0)
            return ResolvedLocation(
                name=best_entry.name,
                category=best_entry.category,
                lat=best_entry.lat,
                lon=best_entry.lon,
                geohash=best_entry.geohash,
                province=best_entry.province,
                matched_term=matched_term,
                confidence=confidence,
            )

        if fallback_to_default:
            return ResolvedLocation(
                name=DEFAULT_ARGENTINA_LOCATION.name,
                category=DEFAULT_ARGENTINA_LOCATION.category,
                lat=DEFAULT_ARGENTINA_LOCATION.lat,
                lon=DEFAULT_ARGENTINA_LOCATION.lon,
                geohash=DEFAULT_ARGENTINA_LOCATION.geohash,
                province=DEFAULT_ARGENTINA_LOCATION.province,
                matched_term="argentina_default",
                confidence=0.5,
            )

        return None

    def find_all(self, text: str) -> list[ResolvedLocation]:
        """Finds all distinct locations mentioned in text."""
        norm = normalize_text(text)
        seen_names = set()
        results: list[ResolvedLocation] = []

        for match in self._pattern.finditer(norm):
            term = match.group(1)
            entry = self._term_to_entry.get(term)
            if entry and entry.name not in seen_names:
                seen_names.add(entry.name)
                results.append(
                    ResolvedLocation(
                        name=entry.name,
                        category=entry.category,
                        lat=entry.lat,
                        lon=entry.lon,
                        geohash=entry.geohash,
                        province=entry.province,
                        matched_term=term,
                        confidence=0.9,
                    )
                )

        return sorted(results, key=lambda r: r.category == "landmark", reverse=True)
