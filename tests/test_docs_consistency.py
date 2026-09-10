from pathlib import Path
from unittest.mock import patch


from scripts.verify_docs_consistency import (
    check_architectural_invariants,
    check_markdown_links,
    check_message_schema_consistency,
    check_schema_consistency,
    extract_anchors_from_markdown,
    extract_markdown_links,
    find_unnegated_patterns,
    main,
    parse_sql_create_tables,
    slugify_heading,
    verify_all,
)

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_verify_all_on_repository():
    """Verify that the current repository passes all documentation consistency checks."""
    is_clean, results = verify_all(REPO_ROOT)
    assert is_clean is True, f"Consistency check failed with results: {results}"
    for category, errors in results.items():
        assert len(errors) == 0, f"Errors in {category}: {errors}"


def test_main_cli_exit_code_success():
    """Verify CLI main entrypoint returns 0 when repository is clean."""
    exit_code = main(["--repo-root", str(REPO_ROOT)])
    assert exit_code == 0


def test_main_cli_exit_code_failure(tmp_path):
    """Verify CLI main entrypoint returns 1 when an error exists."""
    # Empty directory has missing invariants and docs
    exit_code = main(["--repo-root", str(tmp_path)])
    assert exit_code == 1


def test_slugify_heading():
    """Test GitHub markdown heading anchor generation."""
    slugs = slugify_heading("## 1. Cryptographic Identity")
    assert "1-cryptographic-identity" in slugs

    slugs2 = slugify_heading("#### 1. Peer Registration (`register`)")
    assert "1-peer-registration-register" in slugs2

    slugs3 = slugify_heading("## Sovereign Space-Time (Past, Present & Future)")
    assert "sovereign-space-time-past-present-future" in slugs3


def test_extract_anchors():
    """Test extracting anchors from headings and HTML elements."""
    md = """# Title
## Section One
Some text <a name="custom-anchor"></a>
<div id="div-anchor">Hello</div>
"""
    anchors = extract_anchors_from_markdown(md)
    assert "title" in anchors
    assert "section-one" in anchors
    assert "custom-anchor" in anchors
    assert "div-anchor" in anchors


def test_extract_markdown_links():
    """Test extracting markdown and image links."""
    content = """
    Check [Protocol](protocol.md) and [Anchor](#section-one).
    Also an image: ![Diagram](assets/diag.png "Title")
    External: [Google](https://google.com)
    """
    links = extract_markdown_links(content)
    targets = [target for _, target in links]
    assert "protocol.md" in targets
    assert "#section-one" in targets
    assert "assets/diag.png" in targets
    assert "https://google.com" in targets


def test_check_markdown_links_detects_broken_file(tmp_path):
    """Test detection of broken internal links to missing files."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "test.md").write_text("[Missing](nonexistent.md)", encoding="utf-8")

    errors = check_markdown_links(tmp_path)
    assert any("nonexistent.md" in err and "does not exist" in err for err in errors)


def test_check_markdown_links_detects_broken_anchor(tmp_path):
    """Test detection of broken anchors in existing markdown files."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "target.md").write_text("# Target Section\nHello", encoding="utf-8")
    (docs / "source.md").write_text("[Go](target.md#bad-anchor)", encoding="utf-8")

    errors = check_markdown_links(tmp_path)
    assert any("#bad-anchor" in err and "not found" in err for err in errors)


def test_check_markdown_links_valid(tmp_path):
    """Test that valid links and anchors produce no errors."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "target.md").write_text("## Valid Section\nHello", encoding="utf-8")
    (docs / "source.md").write_text(
        "[Go](target.md#valid-section)\n[Ext](https://example.com)",
        encoding="utf-8",
    )

    errors = check_markdown_links(tmp_path)
    assert len(errors) == 0


def test_parse_sql_create_tables():
    """Test SQL CREATE TABLE parser."""
    sql = """
    CREATE TABLE IF NOT EXISTS test_table (
        id VARCHAR PRIMARY KEY,
        count BIGINT NOT NULL,
        data JSON
    );
    """
    tables = parse_sql_create_tables(sql)
    assert "test_table" in tables
    cols = tables["test_table"]["columns"]
    assert cols["id"] == "VARCHAR"
    assert cols["count"] == "BIGINT"
    assert cols["data"] == "JSON"
    assert tables["test_table"]["primary_key"] == ["id"]


def test_schema_consistency_detects_mismatch(tmp_path, monkeypatch):
    """Test that schema discrepancies between code and docs are reported."""
    docs = tmp_path / "docs"
    docs.mkdir()
    src_dir = tmp_path / "src" / "strata" / "core"
    src_dir.mkdir(parents=True)

    # Documented table with a mismatched column type
    doc_content = """
    ```sql
    CREATE TABLE IF NOT EXISTS graffitis (
        signature VARCHAR PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        content_text TEXT NOT NULL
    );
    ```
    """
    (docs / "protocol.md").write_text(doc_content, encoding="utf-8")
    (src_dir / "schema.py").write_text("# dummy schema", encoding="utf-8")

    mock_table_schemas = {
        "graffitis": {
            "columns": {
                "signature": "VARCHAR",
                "timestamp": "VARCHAR",  # Mismatch with BIGINT
                "content_text": "TEXT",
            },
            "primary_key": ["signature"],
        }
    }

    monkeypatch.syspath_prepend(str(tmp_path / "src"))
    with patch.dict("sys.modules", {"strata.core.schema": type("M", (), {"TABLE_SCHEMAS": mock_table_schemas})}):
        errors = check_schema_consistency(tmp_path)
        assert any("type mismatch" in err and "timestamp" in err for err in errors)


def test_find_unnegated_patterns():
    """Test unnegated pattern detection with negative context tolerance."""
    pattern = __import__("re").compile(r"centralized\s+database\s+for\s+messages", __import__("re").I)

    # Negated examples should NOT match
    assert len(find_unnegated_patterns("System does not act as a centralized database for messages.", pattern)) == 0
    assert len(find_unnegated_patterns("No centralized database for messages is permitted.", pattern)) == 0
    assert len(find_unnegated_patterns("The node operates without a centralized database for messages.", pattern)) == 0

    # Positive / unnegated assertion SHOULD match
    matches = find_unnegated_patterns("We provide a centralized database for messages.", pattern)
    assert len(matches) == 1


def test_check_architectural_invariants_detects_drift(tmp_path):
    """Test that architectural drift anti-patterns are caught."""
    docs = tmp_path / "docs"
    docs.mkdir()

    # Valid invariants file
    (docs / "architecture-invariants.md").write_text(
        """# Invariants
Ed25519 keypairs, 32-byte seeds, canonical JSON signature verification.
expressive voluntary anchor, not surveillance, declarative coordinates.
Tracker matchmaking signaling coordinator, no centralized persistence of messages or user accounts.
DuckDB embedded, storage metabolism, Handshake immunity, trusted_handshakes, graffitis.
strata-sync WebRTC DataChannels BLE.
[Protocol](protocol.md) [README](../README.md)
""",
        encoding="utf-8",
    )

    # protocol.md with architectural drift
    (docs / "protocol.md").write_text(
        """# Protocol
Reference: architecture-invariants.md
Notice: The Tracker stores messages indefinitely in cloud database.
""",
        encoding="utf-8",
    )

    (tmp_path / "README.md").write_text(
        """# Readme
[Invariants](docs/architecture-invariants.md)
[Protocol](docs/protocol.md)
""",
        encoding="utf-8",
    )

    errors = check_architectural_invariants(tmp_path)
    assert any("Tracker stores or persists messages" in err for err in errors)


def test_check_message_schema_consistency(tmp_path):
    """Test message schema validation against models.py."""
    src_dir = tmp_path / "src" / "strata" / "core"
    src_dir.mkdir(parents=True)
    docs = tmp_path / "docs"
    docs.mkdir()

    (src_dir / "models.py").write_text(
        """
        data = {
            "version": "1.0",
            "header": {"author_pk": "abc", "parent_signature": "def", "timestamp": 123},
            "location": {"geohash": "123"},
            "content": {"text": "hello"},
        }
        """,
        encoding="utf-8",
    )

    (docs / "protocol.md").write_text(
        """
        ```json
        {
          "version": "1.0",
          "header": {},
          "location": {},
          "content": {}
        }
        ```
        """,
        encoding="utf-8",
    )

    errors = check_message_schema_consistency(tmp_path)
    assert len(errors) == 0
