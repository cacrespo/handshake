"""
Tests for Argentine News Crawler & Spatio-Temporal Seeder Agent.

Validates:
1. Argentine Gazetteer NER and geocoding accuracy.
2. RSS 2.0 and Atom feed parsing and timestamp conversion.
3. Canonical Ed25519 message signing and cryptographic verification.
4. Embedded DuckDB StrataStorage persistence and spatial-temporal queries.
5. Autonomous agent crawl cycle and deduplication.
6. CLI integration via Typer runner.
"""

import threading
import time

from cryptography.hazmat.primitives.asymmetric import ed25519
from typer.testing import CliRunner

from strata.agents.crawler import (
    ArgentineNewsAgent,
    clean_html,
    format_graffiti_content,
    parse_feed_xml,
    parse_pub_date,
)
from strata.agents.gazetteer import ArgentineGazetteer
from strata.cli import app
from strata.core.identity import IdentityManager
from strata.core.models import Message
from strata.core.storage import StorageManager, StrataStorage

SAMPLE_RSS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Noticias Argentinas</title>
    <link>https://ejemplo.com.ar</link>
    <item>
      <title>Protesta y corte total en el Obelisco porteño</title>
      <link>https://ejemplo.com.ar/obelisco-protesta-1</link>
      <description><![CDATA[<p>Cientos de personas se manifiestan frente al <b>Obelisco</b> en la Av. 9 de Julio.</p>]]></description>
      <pubDate>Fri, 25 Sep 2026 14:00:00 -0300</pubDate>
      <category>Sociedad</category>
    </item>
    <item>
      <title>Inauguran nuevo polo tecnológico en Palermo</title>
      <link>https://ejemplo.com.ar/palermo-tech-2</link>
      <description>El gobierno de la Ciudad presentó nuevas oficinas en el barrio de Palermo.</description>
      <pubDate>Thu, 24 Sep 2026 18:30:00 GMT</pubDate>
      <category>Tecnología</category>
    </item>
    <item>
      <title>Fuerte temporal de nieve en Bariloche</title>
      <link>https://ejemplo.com.ar/bariloche-temporal-3</link>
      <description>Las intensas nevadas en Bariloche complican la circulación en las rutas andinas.</description>
      <pubDate>Wed, 23 Sep 2026 10:15:00 -0300</pubDate>
      <category>Clima</category>
    </item>
  </channel>
</rss>
"""

SAMPLE_ATOM_XML = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed Regional Rosario</title>
  <entry>
    <title>Récord de exportaciones en el puerto de Rosario</title>
    <link href="https://ejemplo.com.ar/rosario-puerto-4" rel="alternate"/>
    <summary>La actividad portuaria en Rosario alcanzó cifras históricas este trimestre.</summary>
    <published>2026-09-25T11:00:00Z</published>
    <id>urn:uuid:rosario-4</id>
    <category term="Economía"/>
  </entry>
  <entry>
    <title>Cumbre cultural en la ciudad de Mendoza</title>
    <link href="https://ejemplo.com.ar/mendoza-cumbre-5"/>
    <content type="html">&lt;p&gt;Artistas de todo Cuyo se reúnen en Mendoza.&lt;/p&gt;</content>
    <updated>2026-09-25T12:00:00-03:00</updated>
    <id>urn:uuid:mendoza-5</id>
    <category term="Cultura"/>
  </entry>
</feed>
"""


# ==============================================================================
# 1. Argentine Gazetteer & Spatio-Temporal NER Tests
# ==============================================================================


def test_gazetteer_landmarks_resolution():
    gazetteer = ArgentineGazetteer()

    res = gazetteer.resolve("Movilización masiva frente al Obelisco por reclamos")
    assert res is not None
    assert res.name == "Obelisco"
    assert res.category == "landmark"
    assert res.geohash == "69y7pkx"
    assert abs(res.lat - (-34.6037)) < 0.001
    assert abs(res.lon - (-58.3816)) < 0.001

    res_plaza = gazetteer.resolve("Acto conmemorativo en Plaza de Mayo")
    assert res_plaza is not None
    assert res_plaza.name == "Plaza de Mayo"

    res_congreso = gazetteer.resolve("Debate clave en el Congreso de la Nación sobre presupuesto")
    assert res_congreso is not None
    assert res_congreso.name == "Congreso de la Nación"


def test_gazetteer_neighborhoods_and_cities():
    gazetteer = ArgentineGazetteer()

    res_palermo = gazetteer.resolve("Corte de luz afecta a vecinos de Palermo")
    assert res_palermo is not None
    assert res_palermo.name == "Palermo"
    assert res_palermo.category == "neighborhood"

    res_rosario = gazetteer.resolve("Nuevas obras de infraestructura vial en Rosario")
    assert res_rosario is not None
    assert res_rosario.name == "Rosario"
    assert res_rosario.province == "Santa Fe"

    res_bariloche = gazetteer.resolve("Temporada invernal récord en Bariloche con ocupación plena")
    assert res_bariloche is not None
    assert res_bariloche.name == "Bariloche"
    assert res_bariloche.province == "Río Negro"


def test_gazetteer_accent_insensitivity():
    gazetteer = ArgentineGazetteer()

    # Accented vs Unaccented Córdoba
    res1 = gazetteer.resolve("Encuentro federal en Córdoba capital")
    res2 = gazetteer.resolve("Encuentro federal en Cordoba capital")
    assert res1 is not None and res2 is not None
    assert res1.name == res2.name == "Córdoba"

    # Accented vs Unaccented Núñez
    res3 = gazetteer.resolve("Nuevo paso bajo nivel en Núñez")
    res4 = gazetteer.resolve("Nuevo paso bajo nivel en Nunez")
    assert res3 is not None and res4 is not None
    assert res3.name == res4.name == "Núñez"


def test_gazetteer_priority_and_length():
    gazetteer = ArgentineGazetteer()

    # Landmark Obelisco inside Buenos Aires should pick Obelisco
    res = gazetteer.resolve("Incidentes en el Obelisco durante festejo en Buenos Aires")
    assert res is not None
    assert res.name == "Obelisco"

    # San Martín de los Andes vs San Martín
    res_sma = gazetteer.resolve("Turismo de aventura en San Martín de los Andes")
    assert res_sma is not None
    assert res_sma.name == "San Martín de los Andes"


def test_gazetteer_default_fallback():
    gazetteer = ArgentineGazetteer()

    # Text without specific Argentine location
    res = gazetteer.resolve("El Directorio del Banco Central resolvió ajustar las tasas")
    assert res is not None
    assert res.name == "Buenos Aires"
    assert res.matched_term == "argentina_default"

    # If fallback disabled
    res_none = gazetteer.resolve("Texto genérico sin mención geográfica", fallback_to_default=False)
    assert res_none is None


def test_gazetteer_find_all_locations():
    gazetteer = ArgentineGazetteer()
    text = "La comitiva viajó desde Rosario hasta Córdoba y luego visitó Mendoza."
    found = gazetteer.find_all(text)
    names = [f.name for f in found]
    assert "Rosario" in names
    assert "Córdoba" in names
    assert "Mendoza" in names


# ==============================================================================
# 2. RSS / Atom Feed Parsing & Date Conversion Tests
# ==============================================================================


def test_clean_html_strips_tags_and_entities():
    raw = "<p>Hola <b>Mundo</b>! &quot;Argentina&quot; &amp; m&aacute;s</p>"
    clean = clean_html(raw)
    assert clean == 'Hola Mundo! "Argentina" & más'


def test_parse_pub_date_formats():
    # RFC 2822
    ts1 = parse_pub_date("Fri, 25 Sep 2026 14:00:00 -0300")
    assert ts1 > 0

    # ISO 8601
    ts2 = parse_pub_date("2026-09-25T14:00:00Z")
    assert ts2 > 0

    # Empty / invalid fallback
    now = int(time.time())
    ts3 = parse_pub_date("")
    assert abs(ts3 - now) <= 2


def test_parse_rss_xml_items():
    items = parse_feed_xml(SAMPLE_RSS_XML, source_name="Clarín")
    assert len(items) == 3

    item1 = items[0]
    assert "Obelisco" in item1.headline
    assert item1.url == "https://ejemplo.com.ar/obelisco-protesta-1"
    assert "Cientos de personas" in item1.summary
    assert item1.source == "Clarín"
    assert "Sociedad" in item1.tags
    assert item1.timestamp > 0


def test_parse_atom_xml_entries():
    items = parse_feed_xml(SAMPLE_ATOM_XML, source_name="Regional")
    assert len(items) == 2

    item1 = items[0]
    assert "Rosario" in item1.headline
    assert item1.url == "https://ejemplo.com.ar/rosario-puerto-4"
    assert "Economía" in item1.tags

    item2 = items[1]
    assert "Mendoza" in item2.headline
    assert "Artistas de todo Cuyo" in item2.summary
    assert "Cultura" in item2.tags


def test_parse_invalid_xml_graceful():
    items = parse_feed_xml("not valid xml <<<", source_name="Broken")
    assert items == []


# ==============================================================================
# 3. Message Construction & Canonical Ed25519 Signing Tests
# ==============================================================================


def test_canonical_message_signing_and_verification(tmp_path):
    id_mgr = IdentityManager(config_path=str(tmp_path))
    gazetteer = ArgentineGazetteer()
    resolved = gazetteer.resolve("Marcha en el Obelisco")
    assert resolved is not None

    headline = "Marcha en el Obelisco"
    summary = "Reclamos en la avenida 9 de Julio."
    url = "https://ejemplo.com.ar/marcha"

    tags = ["#noticias", "#argentina", "#obelisco", "#buenosaires"]
    from strata.agents.crawler import NewsItem
    item = NewsItem(
        headline=headline,
        summary=summary,
        url=url,
        pub_date_raw="",
        timestamp=1787928000,
        source="TestFeed",
        guid=url,
        tags=["Sociedad"],
    )
    content = format_graffiti_content(item, resolved, tags)

    msg = Message(
        author_pk=id_mgr.public_key.public_bytes_raw(),
        geohash=resolved.geohash,
        content=content,
        timestamp=item.timestamp,
        extra={"attachments": [{"type": "news", "url": url}]},
    )

    # Prior to signing
    assert msg.verify() is False

    # Canonical sign
    msg.sign(id_mgr.private_key)
    assert msg.signature is not None
    assert msg.verify() is True

    # Tamper detection: modifying content invalidates signature
    msg.content = "Contenido adulterado"
    assert msg.verify() is False


# ==============================================================================
# 4. Embedded DuckDB StrataStorage Tests
# ==============================================================================


def test_strata_storage_lifecycle(tmp_path):
    db_file = tmp_path / "strata_test.duckdb"
    storage = StrataStorage(str(db_file))
    assert storage.count_graffitis() == 0

    id_mgr = IdentityManager(config_path=str(tmp_path))

    # Create message
    msg = Message(
        author_pk=id_mgr.public_key.public_bytes_raw(),
        geohash="69y7pkx",
        content="Test graffiti Obelisco",
        timestamp=1787928000,
    )
    msg.sign(id_mgr.private_key)

    sig = storage.save_graffiti(
        message=msg,
        lat=-34.6037,
        lon=-58.3816,
        attachments=[{"type": "link", "url": "https://test.com"}],
        is_pinned=False,
    )
    assert sig == msg.signature.hex()
    assert storage.count_graffitis() == 1

    # Fetch by signature
    row = storage.get_graffiti(sig)
    assert row is not None
    assert row["signature"] == sig
    assert row["author_pk"] == id_mgr.get_public_key_hex()
    assert row["geohash"] == "69y7pkx"
    assert abs(row["lat"] - (-34.6037)) < 0.0001
    assert abs(row["lon"] - (-58.3816)) < 0.0001
    assert "Test graffiti" in row["content_text"]
    assert "https://test.com" in row["attachments_json"]

    # Spatial query with geohash prefix
    results = storage.get_graffitis(geohash_prefix="69y7")
    assert len(results) == 1
    assert results[0]["signature"] == sig

    # Non-matching prefix
    no_results = storage.get_graffitis(geohash_prefix="dr5r")
    assert len(no_results) == 0

    storage.close()


def test_strata_storage_metabolism_and_trusted_handshakes(tmp_path):
    storage = StrataStorage(":memory:")
    priv_untrusted = ed25519.Ed25519PrivateKey.generate()
    priv_trusted = ed25519.Ed25519PrivateKey.generate()

    trusted_pk = priv_trusted.public_key().public_bytes_raw().hex()
    storage.add_trusted_handshake(public_key=trusted_pk, alias="Amigo")
    assert storage.is_trusted(trusted_pk) is True

    # Untrusted unpinned message
    msg_untrusted = Message(
        author_pk=priv_untrusted.public_key().public_bytes_raw(),
        geohash="69y7pkx",
        content="Untrusted message",
        timestamp=1000,
    )
    msg_untrusted.sign(priv_untrusted)
    storage.save_graffiti(msg_untrusted, is_pinned=False)

    # Trusted unpinned message
    msg_trusted = Message(
        author_pk=priv_trusted.public_key().public_bytes_raw(),
        geohash="69y7pkx",
        content="Trusted message",
        timestamp=1001,
    )
    msg_trusted.sign(priv_trusted)
    storage.save_graffiti(msg_trusted, is_pinned=False)

    # Untrusted but pinned message
    msg_pinned = Message(
        author_pk=priv_untrusted.public_key().public_bytes_raw(),
        geohash="69y7pkx",
        content="Pinned message",
        timestamp=1002,
    )
    msg_pinned.sign(priv_untrusted)
    storage.save_graffiti(msg_pinned, is_pinned=True)

    assert storage.count_graffitis() == 3

    # Metabolism cleanup: should delete only the untrusted unpinned message
    storage.metabolism_cleanup(limit=10)
    assert storage.count_graffitis() == 2

    remaining_sigs = [g["signature"] for g in storage.get_graffitis()]
    assert msg_untrusted.signature.hex() not in remaining_sigs
    assert msg_trusted.signature.hex() in remaining_sigs
    assert msg_pinned.signature.hex() in remaining_sigs

    storage.close()


def test_strata_storage_thread_reconstruction(tmp_path):
    storage = StrataStorage(":memory:")
    priv = ed25519.Ed25519PrivateKey.generate()
    pub = priv.public_key().public_bytes_raw()

    # Root message
    root = Message(author_pk=pub, geohash="69y7pkx", content="Root question", timestamp=100)
    root.sign(priv)
    storage.save_graffiti(root)

    # Reply 1
    reply1 = Message(
        author_pk=pub,
        geohash="69y7pkx",
        content="Reply 1",
        timestamp=105,
        parent_signature=root.signature,
    )
    reply1.sign(priv)
    storage.save_graffiti(reply1)

    # Reply 2 (nested under reply 1)
    reply2 = Message(
        author_pk=pub,
        geohash="69y7pkx",
        content="Reply 2",
        timestamp=110,
        parent_signature=reply1.signature,
    )
    reply2.sign(priv)
    storage.save_graffiti(reply2)

    # Thread reconstruction
    thread = storage.get_thread(root.signature.hex())
    assert len(thread) == 3
    assert [t["content_text"] for t in thread] == ["Root question", "Reply 1", "Reply 2"]

    storage.close()


# ==============================================================================
# 5. Full Autonomous Agent Pipeline & Deduplication Tests
# ==============================================================================


def test_argentine_news_agent_crawl_pipeline(tmp_path):
    storage = StrataStorage(":memory:")
    id_mgr = IdentityManager(config_path=str(tmp_path))

    feeds = [
        {"name": "Clarín", "url": "https://feed1.com/rss", "region": "Nacional"},
        {"name": "La Capital", "url": "https://feed2.com/atom", "region": "Rosario"},
    ]

    def mock_fetch(url: str) -> str:
        if "feed1" in url:
            return SAMPLE_RSS_XML
        elif "feed2" in url:
            return SAMPLE_ATOM_XML
        return ""

    # Optional StorageManager
    sm_dir = tmp_path / "swarm_storage"
    sm = StorageManager(base_path=str(sm_dir))

    agent = ArgentineNewsAgent(
        storage=storage,
        identity_manager=id_mgr,
        feeds=feeds,
        fetch_fn=mock_fetch,
        storage_manager=sm,
    )

    # Crawl cycle 1
    msgs = agent.crawl_all(limit_per_feed=10)
    assert len(msgs) == 5  # 3 from RSS + 2 from Atom
    assert storage.count_graffitis() == 5

    # Check that all messages are verified
    for m in msgs:
        assert m.verify() is True
        assert m.author_pk == id_mgr.public_key.public_bytes_raw()

    # Check deduplication on second crawl cycle
    msgs_cycle2 = agent.crawl_all(limit_per_feed=10)
    assert len(msgs_cycle2) == 0
    assert storage.count_graffitis() == 5

    storage.close()


def test_argentine_news_agent_daemon_runner(tmp_path):
    storage = StrataStorage(":memory:")
    id_mgr = IdentityManager(config_path=str(tmp_path))

    agent = ArgentineNewsAgent(
        storage=storage,
        identity_manager=id_mgr,
        feeds=[{"name": "Test", "url": "https://feed.test/rss"}],
        fetch_fn=lambda url: SAMPLE_RSS_XML,
    )

    stop_event = threading.Event()

    def stop_after_delay():
        time.sleep(0.3)
        stop_event.set()

    thread = threading.Thread(target=stop_after_delay)
    thread.start()

    agent.run_daemon(interval=1, limit_per_feed=2, stop_event=stop_event)
    thread.join()

    assert storage.count_graffitis() == 2
    storage.close()


# ==============================================================================
# 6. Typer CLI Integration Tests
# ==============================================================================


def test_cli_news_crawl_command(tmp_path, monkeypatch):
    runner = CliRunner()
    db_path = str(tmp_path / "cli_test.duckdb")
    config_dir = str(tmp_path / ".strata_cli")

    # Mock ArgentineNewsAgent.crawl_all to avoid actual network calls
    def mock_crawl_all(self, limit_per_feed=5):
        id_mgr = self.identity_manager
        msg = Message(
            author_pk=id_mgr.public_key.public_bytes_raw(),
            geohash="69y7pkx",
            content="📰 Test CLI News\n\nSummary text.\n\n📍 Obelisco\n🔗 https://test.cli",
            timestamp=1787928000,
            extra={"resolved_location": {"name": "Obelisco"}},
        )
        msg.sign(id_mgr.private_key)
        self.storage.save_graffiti(msg)
        return [msg]

    monkeypatch.setattr(ArgentineNewsAgent, "crawl_all", mock_crawl_all)

    result = runner.invoke(
        app,
        [
            "agent",
            "news-crawl",
            "--once",
            "--limit",
            "2",
            "--storage-path",
            db_path,
            "--config-path",
            config_dir,
        ],
    )

    assert result.exit_code == 0
    assert "Starting Argentine News Crawler" in result.stdout
    assert "Crawl complete! Ingested 1 new graffitis into DuckDB" in result.stdout
    assert "Obelisco" in result.stdout
