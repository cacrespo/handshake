"""
Argentine News Crawler & Spatio-Temporal Graffiti Seeder.

Monitors national and regional Argentine news RSS/Atom feeds, resolves spatio-temporal
anchors (coordinates + geohashes), canonically signs Handshake graffiti messages,
and seeds them into local DuckDB storage (StrataStorage) and P2P swarms.
"""

from __future__ import annotations

from dataclasses import dataclass
import email.utils
import html
import logging
import re
import time
from typing import Any, Callable
import urllib.request
import xml.etree.ElementTree as ET

from strata.agents.gazetteer import (
    ArgentineGazetteer,
    ResolvedLocation,
    normalize_text,
)
from strata.core.identity import IdentityManager
from strata.core.models import Message
from strata.core.storage import StorageManager, StrataStorage

logger = logging.getLogger("strata.agents.news")


DEFAULT_ARGENTINE_FEEDS = [
    {"name": "Clarín", "url": "https://www.clarin.com/rss/lo-ultimo/", "region": "Nacional"},
    {"name": "La Nación", "url": "https://www.lanacion.com.ar/arc/outboundfeeds/rss/", "region": "Nacional"},
    {"name": "Infobae", "url": "https://www.infobae.com/arc/outboundfeeds/rss/", "region": "Nacional"},
    {"name": "Página 12", "url": "https://www.pagina12.com.ar/rss/portada", "region": "Nacional"},
    {"name": "Somos Télam", "url": "https://somostelam.com.ar/feed/", "region": "Nacional"},
    {"name": "Ámbito", "url": "https://www.ambito.com/rss/home.xml", "region": "Nacional / Economía"},
    {"name": "La Voz del Interior", "url": "https://www.lavoz.com.ar/arc/outboundfeeds/rss/", "region": "Córdoba"},
    {"name": "El Día", "url": "https://www.eldia.com/rss", "region": "La Plata"},
    {"name": "La Capital", "url": "https://www.lacapital.com.ar/rss/home.xml", "region": "Rosario"},
]


@dataclass
class NewsItem:
    headline: str
    summary: str
    url: str
    pub_date_raw: str
    timestamp: int
    source: str
    guid: str
    tags: list[str]


def clean_html(raw_html: str) -> str:
    """Strips HTML tags, collapses whitespace, and unescapes HTML entities."""
    if not raw_html:
        return ""
    # Strip HTML tags
    clean = re.sub(r"<[^>]+>", " ", raw_html)
    # Unescape entities (e.g. &aacute;, &quot;)
    clean = html.unescape(clean)
    # Remove space before punctuation
    clean = re.sub(r"\s+([,.:;!?])", r"\1", clean)
    # Normalize whitespace
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def parse_pub_date(pub_date_str: str) -> int:
    """
    Parses RFC 2822 or ISO 8601 publication timestamps to UNIX epoch seconds.
    Falls back to current timestamp if unparseable.
    """
    if not pub_date_str:
        return int(time.time())

    clean_str = pub_date_str.strip()

    # Try RFC 2822 (standard RSS pubDate)
    try:
        dt = email.utils.parsedate_to_datetime(clean_str)
        return int(dt.timestamp())
    except Exception:
        pass

    # Try ISO 8601 (Atom format)
    try:
        import datetime

        # Handle trailing Z
        if clean_str.endswith("Z"):
            clean_str = clean_str[:-1] + "+00:00"
        dt = datetime.datetime.fromisoformat(clean_str)
        return int(dt.timestamp())
    except Exception:
        pass

    return int(time.time())


def find_child(elem: ET.Element, *tags: str) -> ET.Element | None:
    """Finds first matching child element by tags or wildcard {*}tag without boolean casting."""
    for tag in tags:
        child = elem.find(f"{{*}}{tag}")
        if child is not None:
            return child
        child = elem.find(tag)
        if child is not None:
            return child
    return None


def parse_feed_xml(xml_content: str, source_name: str = "") -> list[NewsItem]:
    """
    Parses XML string into standardized NewsItem instances.
    Supports both RSS 2.0 (<channel><item>) and Atom (<feed><entry>).
    """
    items: list[NewsItem] = []
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        logger.error(f"Failed to parse XML for source '{source_name}': {e}")
        return items

    # Strip XML namespaces for easier querying
    tag_clean = root.tag.split("}")[-1] if "}" in root.tag else root.tag

    if tag_clean == "feed":
        # Atom Feed
        entries = root.findall(".//{*}entry")
        if not entries:
            entries = root.findall(".//entry")

        for entry in entries:
            title_elem = find_child(entry, "title")
            headline = clean_html(
                title_elem.text if title_elem is not None and title_elem.text else ""
            )

            link = ""
            links = entry.findall("{*}link") or entry.findall("link")
            for l_elem in links:
                if l_elem.get("href"):
                    link = l_elem.get("href", "")
                    break
                elif l_elem.text:
                    link = l_elem.text.strip()
                    break

            summary_elem = find_child(entry, "summary", "content")
            summary = clean_html(
                summary_elem.text
                if summary_elem is not None and summary_elem.text
                else ""
            )

            pub_elem = find_child(entry, "published", "updated")
            pub_raw = (
                pub_elem.text.strip()
                if pub_elem is not None and pub_elem.text
                else ""
            )
            ts = parse_pub_date(pub_raw)

            id_elem = find_child(entry, "id")
            guid = (
                id_elem.text.strip()
                if id_elem is not None and id_elem.text
                else link or headline
            )

            tags = []
            cats = entry.findall("{*}category") or entry.findall("category")
            for cat in cats:
                term = cat.get("term") or (cat.text if cat.text else "")
                if term:
                    tags.append(term.strip())

            if headline:
                items.append(
                    NewsItem(
                        headline=headline,
                        summary=summary,
                        url=link,
                        pub_date_raw=pub_raw,
                        timestamp=ts,
                        source=source_name,
                        guid=guid,
                        tags=tags,
                    )
                )

    else:
        # RSS 2.0 Feed
        for item in root.findall(".//item"):
            title_elem = find_child(item, "title")
            headline = clean_html(
                title_elem.text if title_elem is not None and title_elem.text else ""
            )

            link_elem = find_child(item, "link")
            link = (
                link_elem.text.strip()
                if link_elem is not None and link_elem.text
                else ""
            )

            desc_elem = find_child(item, "description", "encoded")
            summary = clean_html(
                desc_elem.text if desc_elem is not None and desc_elem.text else ""
            )

            pub_elem = find_child(item, "pubDate", "date")
            pub_raw = (
                pub_elem.text.strip()
                if pub_elem is not None and pub_elem.text
                else ""
            )
            ts = parse_pub_date(pub_raw)

            guid_elem = find_child(item, "guid")
            guid = (
                guid_elem.text.strip()
                if guid_elem is not None and guid_elem.text
                else link or headline
            )

            tags = []
            for cat in item.findall("category"):
                if cat.text:
                    tags.append(cat.text.strip())

            if headline:
                items.append(
                    NewsItem(
                        headline=headline,
                        summary=summary,
                        url=link,
                        pub_date_raw=pub_raw,
                        timestamp=ts,
                        source=source_name,
                        guid=guid,
                        tags=tags,
                    )
                )

    return items


def fetch_url_http(url: str, timeout: int = 15) -> str:
    """Fetches URL content over HTTP with standard User-Agent headers."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "HandshakeNewsAgent/1.0 (+https://github.com/cacrespo/handshake)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def generate_hashtags(item: NewsItem, location: ResolvedLocation) -> list[str]:
    """Generates standardized hashtags for Handshake news graffitis."""
    tags = ["#noticias", "#argentina"]

    # Location tag
    norm_loc = re.sub(r"[^a-z0-9]", "", normalize_text(location.name))
    if norm_loc:
        tags.append(f"#{norm_loc}")

    if location.province:
        norm_prov_full = normalize_text(location.province)
        if "buenos aires" in norm_prov_full:
            tags.append("#buenosaires")
        elif norm_prov_full != normalize_text(location.name):
            norm_prov = re.sub(r"[^a-z0-9]", "", norm_prov_full)
            if norm_prov:
                tags.append(f"#{norm_prov}")

    # Content-based tags
    combined_text = (item.headline + " " + item.summary + " " + " ".join(item.tags)).lower()
    tag_keywords = {
        "politica": ["gobierno", "congreso", "presidente", "senado", "diputados", "ley", "elecciones", "ministro"],
        "economia": ["inflacion", "dolar", "banco central", "bcra", "mercado", "fmi", "tasas", "economia", "precios"],
        "sociedad": ["paro", "transporte", "salud", "educacion", "policia", "crimen", "docentes", "seguridad"],
        "cultura": ["teatro", "cine", "musica", "arte", "festival", "concierto", "exposicion"],
        "deportes": ["futbol", "river", "boca", "seleccion", "messi", "campeonato", "partido", "afa"],
    }
    for tag_name, keywords in tag_keywords.items():
        if any(kw in combined_text for kw in keywords):
            tags.append(f"#{tag_name}")

    return list(dict.fromkeys(tags))  # Deduplicate while preserving order


def format_graffiti_content(
    item: NewsItem,
    location: ResolvedLocation,
    tags: list[str],
) -> str:
    """
    Structures the news item into the canonical Handshake graffiti text layout:
    📰 {Headline}

    {Short Summary / Key takeaway}

    📍 {Resolved Location / Neighborhood, Province}
    🔗 {Source URL}

    #tags...
    """
    loc_display = (
        f"{location.name}, {location.province}"
        if location.province and location.province != location.name
        else location.name
    )

    parts = [
        f"📰 {item.headline}",
        "",
        item.summary if item.summary else "Última noticia registrada.",
        "",
        f"📍 {loc_display}",
        f"🔗 {item.url}",
    ]

    if tags:
        parts.append("")
        parts.append(" ".join(tags))

    return "\n".join(parts)


class ArgentineNewsAgent:
    """
    Autonomous live Argentine news crawler & spatio-temporal graffiti agent.
    Crawls RSS feeds, extracts location context, canonicalizes, Ed25519-signs,
    and seeds messages into DuckDB StrataStorage.
    """

    def __init__(
        self,
        storage: StrataStorage | None = None,
        storage_path: str = "./storage/strata.duckdb",
        identity_manager: IdentityManager | None = None,
        config_path: str = "~/.strata",
        gazetteer: ArgentineGazetteer | None = None,
        feeds: list[dict[str, str]] | None = None,
        fetch_fn: Callable[[str], str] | None = None,
        storage_manager: StorageManager | None = None,
    ):
        self.storage = storage or StrataStorage(storage_path)
        self.identity_manager = identity_manager or IdentityManager(config_path)
        self.gazetteer = gazetteer or ArgentineGazetteer()
        self.feeds = feeds or DEFAULT_ARGENTINE_FEEDS
        self.fetch_fn = fetch_fn or fetch_url_http
        self.storage_manager = storage_manager
        self._processed_urls: set[str] = set()

    def process_news_item(self, item: NewsItem) -> Message | None:
        """
        Processes a single news item: resolves location, constructs canonical Message,
        signs with Ed25519 agent keypair, and stores into DuckDB.
        """
        if not item.headline or not item.url:
            return None

        # Resolve Spatio-Temporal Location
        location = self.gazetteer.resolve(
            headline=item.headline,
            body=item.summary,
            fallback_to_default=True,
        )
        if not location:
            return None

        # Generate tags & content
        tags = generate_hashtags(item, location)
        content_text = format_graffiti_content(item, location, tags)

        # Build Message
        attachments = [
            {
                "type": "news_article",
                "url": item.url,
                "headline": item.headline,
                "source": item.source,
                "location": location.to_dict(),
            }
        ]
        extra_metadata = {
            "attachments": attachments,
            "tags": tags,
            "agent": "argentine-news-crawler-v1",
            "source_feed": item.source,
            "guid": item.guid,
            "resolved_location": location.to_dict(),
        }

        agent_pk_bytes = self.identity_manager.public_key.public_bytes_raw()
        msg = Message(
            author_pk=agent_pk_bytes,
            geohash=location.geohash,
            content=content_text,
            message_type="PUBLIC",
            timestamp=item.timestamp,
            extra=extra_metadata,
        )

        # Canonical Ed25519 Signing
        msg.sign(self.identity_manager.private_key)

        # Persist into DuckDB StrataStorage
        self.storage.save_graffiti(
            message=msg,
            lat=location.lat,
            lon=location.lon,
            attachments=attachments,
            is_pinned=False,
        )

        # Optional seeding into filesystem StorageManager
        if self.storage_manager:
            try:
                from strata.core.geo import generate_info_hash, get_epoch_string
                epoch = get_epoch_string()
                info_hash = generate_info_hash(msg.geohash, epoch)
                self.storage_manager.save_message(info_hash, msg)
            except Exception as e:
                logger.warning(f"Could not seed message to StorageManager: {e}")

        self._processed_urls.add(item.url)
        return msg

    def crawl_feed(self, feed_url: str, source_name: str, limit: int = 10) -> list[Message]:
        """Crawls a single feed and returns newly processed Messages."""
        messages: list[Message] = []
        try:
            xml_data = self.fetch_fn(feed_url)
            items = parse_feed_xml(xml_data, source_name=source_name)
        except Exception as e:
            logger.error(f"Error crawling feed {source_name} ({feed_url}): {e}")
            return messages

        count = 0
        for item in items:
            if count >= limit:
                break
            if item.url in self._processed_urls:
                continue

            msg = self.process_news_item(item)
            if msg:
                messages.append(msg)
                count += 1

        return messages

    def crawl_all(self, limit_per_feed: int = 10) -> list[Message]:
        """Crawls all configured feeds and persists new graffitis."""
        all_messages: list[Message] = []
        for feed in self.feeds:
            name = feed.get("name", "Unknown")
            url = feed.get("url", "")
            if not url:
                continue
            logger.info(f"Crawling Argentine news feed: {name} ({url})")
            msgs = self.crawl_feed(url, name, limit=limit_per_feed)
            all_messages.extend(msgs)
        return all_messages

    def run_daemon(
        self,
        interval: int = 300,
        limit_per_feed: int = 10,
        stop_event: Any | None = None,
    ):
        """Continuously crawls feeds at specified interval."""
        logger.info(f"Starting Argentine News Agent daemon (interval: {interval}s)...")
        while True:
            if stop_event and stop_event.is_set():
                logger.info("Daemon stop signal received.")
                break
            try:
                msgs = self.crawl_all(limit_per_feed=limit_per_feed)
                logger.info(f"Daemon crawl completed: {len(msgs)} new graffitis seeded.")
            except Exception as e:
                logger.error(f"Error in news crawler daemon loop: {e}")

            if stop_event:
                if stop_event.wait(interval):
                    break
            else:
                time.sleep(interval)
