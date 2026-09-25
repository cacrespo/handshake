"""
Strata Autonomous Agents package.
"""

from strata.agents.crawler import ArgentineNewsAgent, NewsItem, parse_feed_xml
from strata.agents.gazetteer import ArgentineGazetteer, ResolvedLocation

__all__ = [
    "ArgentineNewsAgent",
    "NewsItem",
    "parse_feed_xml",
    "ArgentineGazetteer",
    "ResolvedLocation",
]
