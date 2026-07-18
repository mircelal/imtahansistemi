"""HTML mətnini PDF/Word üçün oxunaqlı mətnə çevirmə.

Sual redaktoru (TipTap) HTML-də paraqraf, siyahı (ul/ol/li) və cədvəl (table/tr/td)
strukturları yarada bilir. Sadə ardıcıl regex əvəzi ilə iç-içə teqləri (məs.
``<td><p>...</p></td>``) etibarlı emal etmək mümkün deyil, ona görə əvvəlcə HTML-i
kiçik bir DOM ağacına çevirib, sonra həm plain-text, həm də ReportLab Paragraph
markup çıxışını bu ağacdan generasiya edirik.
"""

from __future__ import annotations

import html
import re
from html.parser import HTMLParser


class _RLNode:
    __slots__ = ("tag", "children")

    def __init__(self, tag: str) -> None:
        self.tag = tag
        self.children: list["_RLNode | str"] = []


class _DomBuilder(HTMLParser):
    """Yüngül DOM ağacı — xətalı/tamamlanmamış HTML-ə dözümlüdür."""

    _VOID = {"br", "img", "hr"}

    def __init__(self) -> None:
        super().__init__()
        self.root = _RLNode("#root")
        self._stack: list[_RLNode] = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = tag.lower()
        node = _RLNode(t)
        self._stack[-1].children.append(node)
        if t not in self._VOID:
            self._stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._stack[-1].children.append(_RLNode(tag.lower()))

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        for i in range(len(self._stack) - 1, 0, -1):
            if self._stack[i].tag == t:
                del self._stack[i:]
                break

    def handle_data(self, data: str) -> None:
        if data:
            self._stack[-1].children.append(data)


_BLOCKISH_IN_INLINE = ("p", "div", "li", "h1", "h2", "h3", "h4", "blockquote", "tr")


def _parse_dom(value: str) -> _RLNode | None:
    try:
        builder = _DomBuilder()
        builder.feed(value)
        builder.close()
        return builder.root
    except Exception:
        return None


def _walk_rows_and_lines(root: _RLNode, render_inline, add_line) -> None:
    def walk_block(node: "_RLNode | str") -> None:
        if isinstance(node, str):
            add_line(node)
            return
        t = node.tag
        if t in ("script", "style", "br"):
            return
        if t in ("p", "div", "h1", "h2", "h3", "h4", "blockquote"):
            add_line(render_inline(node.children))
        elif t in ("ul", "ol"):
            idx = 1
            ordered = t == "ol"
            for c in node.children:
                if isinstance(c, _RLNode) and c.tag == "li":
                    prefix = f"{idx}. " if ordered else "• "
                    idx += 1
                    add_line(prefix + render_inline(c.children))
                elif isinstance(c, _RLNode):
                    walk_block(c)
        elif t == "li":
            add_line("• " + render_inline(node.children))
        elif t in ("table", "thead", "tbody", "tfoot"):
            for c in node.children:
                walk_block(c)
        elif t == "tr":
            cells = [
                render_inline(c.children).strip()
                for c in node.children
                if isinstance(c, _RLNode) and c.tag in ("td", "th")
            ]
            if cells:
                add_line(" | ".join(cells))
        else:
            for c in node.children:
                walk_block(c)

    for c in root.children:
        walk_block(c)


def _render_plain_inline(children: list["_RLNode | str"]) -> str:
    parts: list[str] = []
    for c in children:
        if isinstance(c, str):
            parts.append(c)
            continue
        t = c.tag
        if t in ("script", "style"):
            continue
        if t == "br":
            parts.append("\n")
            continue
        if t == "sup":
            inner = _render_plain_inline(c.children)
            if inner:
                parts.append(f"^({inner})")
            continue
        if t == "sub":
            inner = _render_plain_inline(c.children)
            if inner:
                parts.append(f"_({inner})")
            continue
        if t in _BLOCKISH_IN_INLINE:
            inner = _render_plain_inline(c.children)
            if inner:
                if parts and not parts[-1].endswith("\n"):
                    parts.append("\n")
                parts.append(inner)
            continue
        parts.append(_render_plain_inline(c.children))
    return "".join(parts)


def html_to_plain_text(value: str) -> str:
    """HTML tag-lərini silir; sətir qırılmaları, siyahı/cədvəl strukturu və sup/sub qeydlərini saxlayır."""
    s = (value or "").strip()
    if not s:
        return ""
    if "<" not in s:
        return s
    root = _parse_dom(s)
    if root is None:
        return re.sub(r"<[^>]+>", " ", html.unescape(s)).strip()

    lines: list[str] = []

    def add_line(text: str) -> None:
        text = re.sub(r"[ \t]{2,}", " ", text).strip()
        if text:
            lines.append(text)

    _walk_rows_and_lines(root, _render_plain_inline, add_line)
    out = "\n".join(lines).strip()
    return out if out else re.sub(r"<[^>]+>", " ", html.unescape(s)).strip()


_RL_MARK_TAGS = {
    "b": "b",
    "strong": "b",
    "i": "i",
    "em": "i",
    "u": "u",
    "sup": "sup",
    "sub": "sub",
    "strike": "strike",
    "s": "strike",
    "del": "strike",
}


def _render_rl_inline(children: list["_RLNode | str"]) -> str:
    """Bir bloğun (paraqraf/xana/siyahı elementi) içini ReportLab inline markup-ına çevirir."""
    parts: list[str] = []
    for c in children:
        if isinstance(c, str):
            parts.append(html.escape(c))
            continue
        t = c.tag
        if t in ("script", "style"):
            continue
        if t == "br":
            parts.append("<br/>")
            continue
        rl = _RL_MARK_TAGS.get(t)
        if rl:
            inner = _render_rl_inline(c.children)
            if inner:
                parts.append(f"<{rl}>{inner}</{rl}>")
            continue
        if t in _BLOCKISH_IN_INLINE:
            # Naməlum HTML-də iç-içə bloklar (məs. <li><p>...</p></li>) — məzmunu
            # sətir kəsmə ilə düzləşdiririk, əks halda mətn bir-birinə yapışar.
            inner = _render_rl_inline(c.children)
            if inner:
                if parts and not parts[-1].endswith("<br/>"):
                    parts.append("<br/>")
                parts.append(inner)
            continue
        # naməlum/dəstəklənməyən teq (span, a, font və s.) — məzmunu saxla, teqi at
        inner = _render_rl_inline(c.children)
        if inner:
            parts.append(inner)
    return "".join(parts)


def html_to_reportlab(value: str) -> str:
    """ReportLab Paragraph üçün minimal markup (bold/italic/underline/sup/sub/siyahı/cədvəl).

    ReportLab-ın Paragraph XML ayrıştırıcısı naməlum teqləri (table/tr/td/ul/li və s.)
    heç bir ayırıcı boşluq qoymadan sözsüz atır — nəticədə "A" və "B" xana mətnləri
    "AB" kimi bir-birinə yapışır. Ona görə DOM ağacından bloklarını (paraqraf/siyahı/
    cədvəl sətri) Paragraph-ın başa düşdüyü sətir kəsmələrinə uyğun sıralayırıq.
    """
    s = (value or "").strip()
    if not s:
        return ""
    if "<" not in s:
        return html.escape(s)
    root = _parse_dom(s)
    if root is None:
        return html.escape(html_to_plain_text(s))

    lines: list[str] = []

    def add_line(text: str) -> None:
        text = text.strip()
        if text:
            lines.append(text)

    _walk_rows_and_lines(root, _render_rl_inline, add_line)
    return "<br/>".join(lines).strip()
