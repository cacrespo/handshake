#!/usr/bin/env python3
"""
Documentation Consistency & Architectural Drift Verifier for Handshake.

Checks:
1. Architectural invariants formalization and consistency across protocol.md, README.md,
   and architecture-invariants.md.
2. Markdown link integrity within docs/ and README.md (internal files and section anchors).
3. Code-vs-docs consistency (database table schemas, message serialization schemas).
"""

import argparse
import re
import sys
from pathlib import Path
from typing import Any


def extract_markdown_links(content: str) -> list[tuple[str, str]]:
    """
    Extracts markdown links and images: [text](target) and ![alt](target).
    Returns list of (link_text, url_target).
    """
    pattern = re.compile(
        r"(?:!\[(?P<alt>[^\]]*)\]|\[(?P<text>[^\]]*)\])\((?P<url>[^)\s]+)(?:\s+[\"'][^\"']*[\"'])?\)"
    )
    results = []
    for match in pattern.finditer(content):
        text = match.group("text") if match.group("text") is not None else match.group("alt")
        url = match.group("url").strip()
        results.append((text or "", url))
    return results


def slugify_heading(heading: str) -> set[str]:
    """
    Generates GitHub Markdown anchor slug variants from a heading text.
    Returns a set containing both verbatim space-to-hyphen and collapsed hyphens.
    """
    # Strip leading markdown heading tokens
    clean = re.sub(r"^#{1,6}\s+", "", heading)
    # Strip formatting: backticks, asterisks, underscores
    clean = re.sub(r"[`*_~]", "", clean).strip().lower()
    # Remove punctuation
    clean = re.sub(r"[^a-z0-9 _-]", "", clean)
    slug1 = re.sub(r"\s+", "-", clean)
    slug2 = re.sub(r"-+", "-", slug1)
    return {slug1, slug2}


def extract_anchors_from_markdown(content: str) -> set[str]:
    """
    Extracts all possible anchor identifiers from a markdown document:
    - Headings (# Heading) converted to GitHub anchor slugs
    - Explicit HTML anchor tags: <a name="...">, <a id="...">, id="..."
    """
    anchors: set[str] = set()

    for line in content.splitlines():
        line_stripped = line.strip()
        if line_stripped.startswith("#"):
            anchors.update(slugify_heading(line_stripped))

    # Match explicit HTML ids or names
    html_anchors = re.findall(r'(?:id|name)=["\']([^"\']+)["\']', content)
    for a in html_anchors:
        anchors.add(a.lower())
        anchors.add(a)

    return anchors


def check_markdown_links(repo_root: Path) -> list[str]:
    """
    Validates all internal markdown links and section anchors in docs/ and README.md.
    """
    errors: list[str] = []
    docs_dir = repo_root / "docs"
    readme = repo_root / "README.md"

    md_files: list[Path] = []
    if docs_dir.exists():
        md_files.extend(docs_dir.rglob("*.md"))
    if readme.exists():
        md_files.append(readme)

    # Cache extracted anchors per file
    file_anchors_cache: dict[Path, set[str]] = {}

    def get_anchors(file_path: Path) -> set[str]:
        if file_path not in file_anchors_cache:
            try:
                content = file_path.read_text(encoding="utf-8")
                file_anchors_cache[file_path] = extract_anchors_from_markdown(content)
            except Exception as e:
                errors.append(f"Failed to read file {file_path}: {e}")
                file_anchors_cache[file_path] = set()
        return file_anchors_cache[file_path]

    external_schemes = ("http://", "https://", "mailto:", "ftp://", "javascript:", "//")

    for src_file in md_files:
        try:
            content = src_file.read_text(encoding="utf-8")
        except Exception as e:
            errors.append(f"Cannot read {src_file.relative_to(repo_root)}: {e}")
            continue

        links = extract_markdown_links(content)
        for text, url in links:
            if url.startswith(external_schemes):
                continue

            # Split path and anchor
            target_path_str, _, anchor = url.partition("#")
            anchor = anchor.strip()

            if target_path_str:
                target_path = (src_file.parent / target_path_str).resolve()
                if not target_path.exists():
                    errors.append(
                        f"Broken link in {src_file.relative_to(repo_root)}: "
                        f"target file '{target_path_str}' does not exist (resolved to {target_path})."
                    )
                    continue
                check_file = target_path
            else:
                check_file = src_file

            if anchor and check_file.suffix == ".md":
                anchors = get_anchors(check_file)
                normalized_anchor = anchor.lower()
                if normalized_anchor not in anchors and anchor not in anchors:
                    errors.append(
                        f"Broken anchor in {src_file.relative_to(repo_root)}: "
                        f"anchor '#{anchor}' not found in '{check_file.relative_to(repo_root)}'."
                    )

    return errors


def parse_sql_create_tables(sql_text: str) -> dict[str, dict[str, Any]]:
    """
    Parses SQL CREATE TABLE statements into table schemas:
    {
      "table_name": {
         "columns": {"col_name": "COL_TYPE"},
         "primary_key": ["col_name"]
      }
    }
    """
    table_pattern = re.compile(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\((.*?)\);",
        re.DOTALL | re.IGNORECASE,
    )
    tables: dict[str, dict[str, Any]] = {}

    for table_name, body in table_pattern.findall(sql_text):
        name = table_name.lower()
        cols: dict[str, str] = {}
        primary_keys: list[str] = []

        lines = body.strip().split("\n")
        for line in lines:
            clean = re.sub(r"--.*$", "", line).strip().rstrip(",")
            if not clean:
                continue

            # Check table-level PRIMARY KEY (col1, col2)
            pk_match = re.match(r"PRIMARY\s+KEY\s*\((.*?)\)", clean, re.IGNORECASE)
            if pk_match:
                pks = [c.strip().lower() for c in pk_match.group(1).split(",")]
                primary_keys.extend(pks)
                continue

            parts = clean.split()
            col_name = parts[0].lower()
            col_type = parts[1].upper() if len(parts) > 1 else "TEXT"

            if "PRIMARY KEY" in clean.upper():
                primary_keys.append(col_name)

            cols[col_name] = col_type

        tables[name] = {"columns": cols, "primary_key": primary_keys}

    return tables


def check_schema_consistency(repo_root: Path) -> list[str]:
    """
    Validates that database table schemas documented in docs/protocol.md match
    the schema definitions in src/strata/core/schema.py.
    """
    errors: list[str] = []
    protocol_doc = repo_root / "docs" / "protocol.md"
    schema_code = repo_root / "src" / "strata" / "core" / "schema.py"

    if not protocol_doc.exists():
        return [f"Missing protocol documentation at {protocol_doc.relative_to(repo_root)}"]
    if not schema_code.exists():
        return [f"Missing schema code file at {schema_code.relative_to(repo_root)}"]

    doc_text = protocol_doc.read_text(encoding="utf-8")
    doc_tables = parse_sql_create_tables(doc_text)

    # Import code schemas dynamically
    sys.path.insert(0, str(repo_root / "src"))
    try:
        from strata.core.schema import TABLE_SCHEMAS
    except Exception as e:
        return [f"Failed to import strata.core.schema: {e}"]

    # 1. Verify documented tables exist in code
    for doc_table_name, doc_meta in doc_tables.items():
        if doc_table_name not in TABLE_SCHEMAS:
            errors.append(
                f"Documented table '{doc_table_name}' in docs/protocol.md is missing from code TABLE_SCHEMAS."
            )
            continue

        code_meta = TABLE_SCHEMAS[doc_table_name]
        code_cols = {k.lower(): v.upper() for k, v in code_meta.get("columns", {}).items()}
        doc_cols = doc_meta["columns"]

        # Check columns
        for col, col_type in doc_cols.items():
            if col not in code_cols:
                errors.append(
                    f"Column '{col}' for table '{doc_table_name}' in docs/protocol.md missing from code."
                )
            elif code_cols[col] != col_type:
                errors.append(
                    f"Column '{col}' in table '{doc_table_name}' type mismatch: "
                    f"docs={col_type}, code={code_cols[col]}."
                )

        for code_col in code_cols:
            if code_col not in doc_cols:
                errors.append(
                    f"Column '{code_col}' in code for table '{doc_table_name}' missing from docs/protocol.md."
                )

        # Check primary key
        doc_pk = sorted(doc_meta.get("primary_key", []))
        code_pk = sorted([p.lower() for p in code_meta.get("primary_key", [])])
        if doc_pk != code_pk:
            errors.append(
                f"Primary key mismatch for table '{doc_table_name}': docs={doc_pk}, code={code_pk}."
            )

    # 2. Verify code tables are documented
    for code_table_name in TABLE_SCHEMAS:
        if code_table_name not in doc_tables:
            errors.append(
                f"Code table '{code_table_name}' in strata.core.schema is not documented in docs/protocol.md."
            )

    return errors


def check_message_schema_consistency(repo_root: Path) -> list[str]:
    """
    Validates that message serialization structure in src/strata/core/models.py
    matches documented fields in docs/protocol.md.
    """
    errors: list[str] = []
    models_file = repo_root / "src" / "strata" / "core" / "models.py"
    protocol_doc = repo_root / "docs" / "protocol.md"

    if not models_file.exists():
        return [f"Missing models file at {models_file.relative_to(repo_root)}"]

    content = models_file.read_text(encoding="utf-8")
    doc_text = protocol_doc.read_text(encoding="utf-8") if protocol_doc.exists() else ""

    # Required structure in Message.to_dict():
    required_blocks = ["version", "header", "location", "content"]
    for block in required_blocks:
        if f'"{block}"' not in content:
            errors.append(f"Message serialization in models.py missing block '{block}'.")

    # Header fields
    header_fields = ["author_pk", "parent_signature", "timestamp"]
    for f in header_fields:
        if f'"{f}"' not in content:
            errors.append(f"Message header serialization in models.py missing field '{f}'.")

    # Check that documented JSON example in protocol.md includes the core blocks
    for block in required_blocks:
        if f'"{block}"' not in doc_text:
            errors.append(f"docs/protocol.md JSON message schema example missing block '{block}'.")

    return errors


def find_unnegated_patterns(text: str, pattern: re.Pattern) -> list[str]:
    """
    Finds matches of a pattern that are NOT preceded by negation words
    (e.g., 'not', 'never', 'no', 'without') within the preceding context.
    """
    matches = []
    negations = {
        "not",
        "no",
        "never",
        "without",
        "neither",
        "prevent",
        "prevents",
        "eliminates",
        "replaces",
    }
    for m in pattern.finditer(text):
        start = max(0, m.start() - 60)
        prefix = text[start : m.start()].lower()
        prefix_words = re.findall(r"\b\w+\b", prefix)
        if not any(w in negations for w in prefix_words[-6:]):
            matches.append(m.group(0))
    return matches


def check_architectural_invariants(repo_root: Path) -> list[str]:
    """
    Verifies that docs/architecture-invariants.md exists, formalizes all 5 core invariants,
    and is consistently cross-referenced and upheld across protocol.md and README.md.
    """
    errors: list[str] = []

    invariants_file = repo_root / "docs" / "architecture-invariants.md"
    protocol_file = repo_root / "docs" / "protocol.md"
    readme_file = repo_root / "README.md"

    if not invariants_file.exists():
        return ["Missing docs/architecture-invariants.md! Architectural invariants must be formalized."]

    inv_text = invariants_file.read_text(encoding="utf-8")
    proto_text = protocol_file.read_text(encoding="utf-8") if protocol_file.exists() else ""
    readme_text = readme_file.read_text(encoding="utf-8") if readme_file.exists() else ""

    # 1. Check all 5 core invariants in architecture-invariants.md
    core_invariants = {
        "Cryptographic Identity": [
            ("Ed25519", "Ed25519 keypairs"),
            ("32-byte", "32-byte seeds"),
            ("canonical JSON", "canonical JSON signature verification"),
        ],
        "Space-Time Anchoring": [
            ("expressive", "Location as expressive anchor"),
            ("voluntary", "Voluntary anchor (not surveillance)"),
            ("declarative", "Declarative coordinates for roots and replies"),
        ],
        "Decentralized Network Topology": [
            ("Tracker", "Tracker role"),
            ("matchmaking", "Matchmaking/signaling coordinator"),
            ("no centralized persistence", "No centralized persistence of messages or user accounts"),
        ],
        "Sovereign Storage": [
            ("DuckDB", "Embedded DuckDB"),
            ("metabolism", "Storage metabolism"),
            ("immunity", "Handshake storage immunity"),
        ],
        "P2P Sync": [
            ("strata-sync", "strata-sync protocol"),
            ("WebRTC", "WebRTC DataChannels"),
            ("BLE", "Bluetooth Low Energy / physical presence"),
        ],
    }

    for invariant_name, keywords in core_invariants.items():
        for kw, desc in keywords:
            if kw.lower() not in inv_text.lower():
                errors.append(
                    f"docs/architecture-invariants.md is missing required invariant '{desc}' "
                    f"under [{invariant_name}] (keyword '{kw}' not found)."
                )

    # 2. Check cross-references between core docs
    if "architecture-invariants.md" not in proto_text:
        errors.append("docs/protocol.md must cross-reference docs/architecture-invariants.md.")
    if "architecture-invariants.md" not in readme_text:
        errors.append("README.md must cross-reference docs/architecture-invariants.md.")
    if "protocol.md" not in inv_text:
        errors.append("docs/architecture-invariants.md must cross-reference docs/protocol.md.")
    if "README.md" not in inv_text:
        errors.append("docs/architecture-invariants.md must cross-reference README.md.")

    # 3. Detect architectural drift or anti-patterns across docs
    drift_patterns = [
        (
            re.compile(r"centralized\s+database\s+for\s+(?:all\s+)?messages", re.IGNORECASE),
            "Anti-pattern detected: claiming centralized database for messages",
        ),
        (
            re.compile(r"tracker\s+(?:persists|stores)\s+(?:all\s+)?messages", re.IGNORECASE),
            "Anti-pattern detected: claiming Tracker stores or persists messages",
        ),
        (
            re.compile(r"centralized\s+persistence\s+of\s+messages", re.IGNORECASE),
            "Anti-pattern detected: claiming centralized persistence of messages",
        ),
        (
            re.compile(r"passive\s+surveillance\s+tracking", re.IGNORECASE),
            "Anti-pattern detected: location described as surveillance",
        ),
    ]

    for doc_name, text in [
        ("README.md", readme_text),
        ("docs/protocol.md", proto_text),
        ("docs/architecture-invariants.md", inv_text),
    ]:
        for pattern, msg in drift_patterns:
            matches = find_unnegated_patterns(text, pattern)
            if matches:
                errors.append(f"{msg} ({matches[0]}) in {doc_name}.")

    return errors


def verify_all(repo_root: Path, verbose: bool = False) -> tuple[bool, dict[str, list[str]]]:
    """
    Runs all consistency checks and returns (is_clean, results_dict).
    """
    results: dict[str, list[str]] = {
        "markdown_links": check_markdown_links(repo_root),
        "architectural_invariants": check_architectural_invariants(repo_root),
        "schema_consistency": check_schema_consistency(repo_root),
        "message_schema": check_message_schema_consistency(repo_root),
    }

    all_errors = [err for errs in results.values() for err in errs]
    return (len(all_errors) == 0, results)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Verify Handshake documentation consistency, markdown links, and architectural invariants."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="Root path of the repository (default: repository containing this script)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose output",
    )

    args = parser.parse_args(argv)
    repo_root = args.repo_root.resolve()

    print("=== Running Documentation Consistency & Architectural Drift Verifier ===")
    print(f"Repository Root: {repo_root}\n")

    is_clean, results = verify_all(repo_root, verbose=args.verbose)

    category_titles = {
        "markdown_links": "Markdown Links & Anchor Integrity",
        "architectural_invariants": "Architectural Invariants & Drift Check",
        "schema_consistency": "Relational Table Schemas (Code vs Docs)",
        "message_schema": "Message Serialization Schema",
    }

    for key, title in category_titles.items():
        errs = results.get(key, [])
        if not errs:
            print(f"  [PASS] {title}")
        else:
            print(f"  [FAIL] {title} ({len(errs)} error(s)):")
            for err in errs:
                print(f"    - {err}")

    print("\n" + "=" * 60)
    if is_clean:
        print("[SUCCESS] All documentation, links, and architectural invariants are consistent!")
        return 0
    else:
        print("[ERROR] Documentation drift or inconsistencies detected.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
