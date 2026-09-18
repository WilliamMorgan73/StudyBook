from app.crud.submodule_links import extract_wikilink_titles


def test_extract_wikilink_titles_plain_link():
    assert extract_wikilink_titles("See [[Graph Traversal]] for background.") == ["Graph Traversal"]


def test_extract_wikilink_titles_aliased_link():
    assert extract_wikilink_titles("See [[Graph Traversal|traversal]] for background.") == ["Graph Traversal"]


def test_extract_wikilink_titles_multiple_links():
    markdown = "Builds on [[Big-O Notation]] and [[Recursion|recursive calls]]."
    assert extract_wikilink_titles(markdown) == ["Big-O Notation", "Recursion"]


def test_extract_wikilink_titles_no_links():
    assert extract_wikilink_titles("Just plain notes, no links here.") == []


def test_extract_wikilink_titles_module_qualified():
    assert extract_wikilink_titles("See [[Data Structures/Graph Traversal]].") == ["Data Structures/Graph Traversal"]


def test_extract_wikilink_titles_inside_inline_code_still_extracted():
    # Skipping code spans is a MarkdownEditor decoration concern, not extraction's.
    assert extract_wikilink_titles("Not a link: `[[literal brackets]]`") == ["literal brackets"]
