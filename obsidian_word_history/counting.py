"""Word-count parity helpers modeled after the local novel-word-count plugin."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
import re
import unicodedata

CJK_PATTERN = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]")
MARKDOWN_LINK_PATTERN = re.compile(r"\[([^\]]*?)\]\([^\)]*?\)", re.IGNORECASE | re.MULTILINE)
WIKI_LINK_PATTERN = re.compile(r"\[\[(.*?)\]\]", re.IGNORECASE | re.MULTILINE)
FOOTNOTE_DEFINITION_PATTERN = re.compile(r"\[\^.+?\]: .*", re.IGNORECASE | re.MULTILINE)
FOOTNOTE_REFERENCE_PATTERN = re.compile(r"\[\^.+?\]", re.IGNORECASE | re.MULTILINE)
COMMENT_PATTERN = re.compile(r"(%%.+?%%|<!--.+?-->)", re.IGNORECASE | re.MULTILINE | re.DOTALL)
CODE_BLOCK_PATTERN = re.compile(r"(```.+?```)", re.IGNORECASE | re.MULTILINE | re.DOTALL)
PLUGIN_CONFIG_RELATIVE_PATH = Path(".obsidian/plugins/novel-word-count/data.json")
COUNTABLE_EXTENSIONS = {
    "",
    "markdown",
    "md",
    "mdml",
    "mdown",
    "mdtext",
    "mdtxt",
    "mdwn",
    "mkd",
    "mkdn",
    "canvas",
    "txt",
    "text",
    "rtf",
    "qmd",
    "rmd",
    "fountain",
    "tex",
}


@dataclass(frozen=True)
class CountConfig:
    exclude_comments: bool = False
    exclude_code_blocks: bool = False
    exclude_non_visible_link_portions: bool = False
    exclude_footnotes: bool = False

    def to_dict(self) -> dict[str, bool]:
        return asdict(self)


@dataclass(frozen=True)
class CountResult:
    char_count: int
    non_whitespace_char_count: int
    newline_count: int
    space_delimited_word_count: int
    cjk_word_count: int

    @property
    def word_count(self) -> int:
        return self.space_delimited_word_count + self.cjk_word_count

    def to_dict(self) -> dict[str, int]:
        return {
            "char_count": self.char_count,
            "non_whitespace_char_count": self.non_whitespace_char_count,
            "newline_count": self.newline_count,
            "space_delimited_word_count": self.space_delimited_word_count,
            "cjk_word_count": self.cjk_word_count,
            "word_count": self.word_count,
        }


def load_count_config(vault_path: Path) -> CountConfig:
    """Load local novel-word-count plugin settings when available."""

    config_path = vault_path / PLUGIN_CONFIG_RELATIVE_PATH
    if not config_path.exists():
        return CountConfig()

    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return CountConfig()

    return CountConfig(
        exclude_comments=bool(data.get("excludeComments", False)),
        exclude_code_blocks=bool(data.get("excludeCodeBlocks", False)),
        exclude_non_visible_link_portions=bool(data.get("excludeNonVisibleLinkPortions", False)),
        exclude_footnotes=bool(data.get("excludeFootnotes", False)),
    )


def trim_frontmatter(content: str) -> str:
    """Trim YAML frontmatter at the start of a note."""

    if not content.startswith("---"):
        return content

    lines = content.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return content

    offset = len(lines[0])
    for line in lines[1:]:
        if line.strip() in {"---", "..."}:
            return content[offset + len(line.rstrip("\r\n")) :]
        offset += len(line)
    return content


def remove_non_counted_content(content: str, config: CountConfig) -> str:
    if config.exclude_code_blocks:
        content = CODE_BLOCK_PATTERN.sub("", content)
    if config.exclude_comments:
        content = COMMENT_PATTERN.sub("", content)
    if config.exclude_non_visible_link_portions:
        content = MARKDOWN_LINK_PATTERN.sub(r"\1", content)
        content = WIKI_LINK_PATTERN.sub(_strip_wiki_link_hidden_portion, content)
    if config.exclude_footnotes:
        content = FOOTNOTE_DEFINITION_PATTERN.sub("", content)
        content = FOOTNOTE_REFERENCE_PATTERN.sub("", content)
    return content


def count_markdown(content: str, config: CountConfig | None = None) -> CountResult:
    effective_config = config or CountConfig()
    meaningful_content = remove_non_counted_content(trim_frontmatter(content), effective_config)
    cjk_word_count = len(CJK_PATTERN.findall(meaningful_content))
    no_cjk = CJK_PATTERN.sub(" ", meaningful_content)
    no_symbols = "".join(
        character for character in no_cjk if unicodedata.category(character)[0] not in {"S", "P"}
    )
    word_sequences = no_symbols.strip().split()
    if word_sequences == [""]:
        word_sequences = []
    line_sequences = meaningful_content.split("\n")
    if line_sequences == [""]:
        line_sequences = []

    return CountResult(
        char_count=len(meaningful_content),
        non_whitespace_char_count=len(re.sub(r"\s", "", meaningful_content)),
        newline_count=len(line_sequences),
        space_delimited_word_count=len(word_sequences),
        cjk_word_count=cjk_word_count,
    )


def count_countable_text(path: str, content: str, config: CountConfig) -> CountResult:
    if Path(path).suffix.lower() == ".canvas":
        return count_markdown(_extract_canvas_text(content), config)
    return count_markdown(content, config)


def is_countable_path(path: str) -> bool:
    path_obj = Path(path)
    if any(part.startswith(".") for part in path_obj.parts):
        return False
    extension = path_obj.suffix.lower().lstrip(".")
    return extension in COUNTABLE_EXTENSIONS


def _strip_wiki_link_hidden_portion(match: re.Match[str]) -> str:
    inner = match.group(1)
    if not inner:
        return ""
    if "|" in inner:
        return inner.split("|", 1)[1]
    return inner


def _extract_canvas_text(content: str) -> str:
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return ""
    texts = []
    for node in payload.get("nodes", []):
        text = node.get("text")
        if text:
            texts.append(str(text))
    return "\n".join(texts)
