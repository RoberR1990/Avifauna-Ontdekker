import pytest

from avipipe.licenses import commons_license, slugify, xc_license


@pytest.mark.parametrize(
    "short,key,expected",
    [
        ("CC BY-SA 4.0", "cc-by-sa-4.0", "CC-BY-SA-4.0"),
        ("CC BY-SA 3.0", "cc-by-sa-3.0", "CC-BY-SA-3.0"),
        ("CC BY 2.0", "cc-by-2.0", "CC-BY-2.0"),
        ("CC BY 4.0", "cc-by-4.0", "CC-BY-4.0"),
        ("CC BY 3.0 de", "cc-by-3.0-de", "CC-BY-3.0-DE"),
        ("CC0", "cc0", "CC0-1.0"),
        ("CC0 1.0", "cc-zero", "CC0-1.0"),
        ("Public domain", "pd", "PDM"),
        ("Public domain", "pd-old-100", "PDM"),
        ("Public domain", "pd-self", "PDM"),
    ],
)
def test_commons_accepted(short, key, expected):
    spdx, reason = commons_license(short, key)
    assert spdx == expected and reason is None


@pytest.mark.parametrize(
    "short,key",
    [
        ("CC BY-NC 2.0", "cc-by-nc-2.0"),
        ("CC BY-NC-SA 4.0", "cc-by-nc-sa-4.0"),
        ("CC BY-ND 2.0", "cc-by-nd-2.0"),
        ("CC BY-NC-ND 4.0", "cc-by-nc-nd-4.0"),
        ("GFDL", "gfdl"),
        ("GFDL 1.2", "gfdl-1.2"),
        ("Fair use", "fair use"),
        ("Copyrighted free use", "copyrighted free use"),
        ("All rights reserved", ""),
        ("", ""),
        (None, None),
    ],
)
def test_commons_rejected(short, key):
    spdx, reason = commons_license(short, key)
    assert spdx is None and reason


@pytest.mark.parametrize(
    "url,spdx,nc",
    [
        ("https://creativecommons.org/licenses/by-sa/4.0/", "CC-BY-SA-4.0", False),
        ("https://creativecommons.org/licenses/by-sa/3.0/", "CC-BY-SA-3.0", False),
        ("//creativecommons.org/licenses/by-nc-sa/4.0/", "CC-BY-NC-SA-4.0", True),
        ("https://creativecommons.org/publicdomain/zero/1.0/", "CC0-1.0", False),
    ],
)
def test_xc_accepted(url, spdx, nc):
    assert xc_license(url)[0] == spdx
    assert xc_license(url)[2] is nc


@pytest.mark.parametrize(
    "url",
    [
        "https://creativecommons.org/licenses/by-nc/4.0/",
        "https://creativecommons.org/licenses/by-nd/4.0/",
        "https://creativecommons.org/licenses/by-nc-nd/4.0/",
        "https://creativecommons.org/licenses/by/4.0/",
        "https://example.org/license",
        "",
        None,
    ],
)
def test_xc_rejected(url):
    spdx, reason, _ = xc_license(url)
    assert spdx is None and reason


def test_slugify():
    assert slugify(" Spheniscus  humboldti ") == "spheniscus-humboldti"
