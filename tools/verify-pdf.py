"""Verify searchable text and semantic structure in the real PDF artifact."""
import sys
from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
text = "\n".join(page.extract_text() for page in reader.pages)
root = reader.trailer["/Root"]
assert root.get("/StructTreeRoot"), "Missing PDF structure tree"
assert root.get("/MarkInfo", {}).get("/Marked"), "PDF is not marked as tagged"
assert "This selectable sentence must survive PDF text extraction." in text, "Lost searchable sentence or reading order"
assert "漢字日本語中文" in text, "Lost CJK text"
assert reader.outline, "Missing document outline"
roles = set()
def visit(node):
    if isinstance(node, list):
        for child in node:
            visit(child)
    elif hasattr(node, "get_object"):
        obj = node.get_object()
        if hasattr(obj, "get"):
            if obj.get("/S"):
                roles.add(str(obj["/S"]))
            visit(obj.get("/K", []))
visit(root["/StructTreeRoot"])
assert {"/Table", "/TH", "/TD", "/H1"}.issubset(roles), f"Missing semantic roles: {roles}"
print({"pages": len(reader.pages), "searchable": True, "tagged": True, "outline": True, "roles": sorted(roles)})
