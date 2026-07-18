"""Early-exit qaydaları — OMRChecker/OpenCV tələb etmir."""

from processor import _variant_good_enough


def test_good_scanner_like_exits():
    assert _variant_good_enough(
        q_count=30,
        digit_score=6,
        intensity_digits=6,
        agree_proxy=28,
        filled=29,
        intensity_filled=29,
        multi_marked=0,
        name_q=11,
        inset_pen=0,
    )


def test_rejects_weak_name_even_if_mcq_full():
    # MCQ+kod dolu, amma ad BAA (Ş itkisi) — early-exit olmamalı
    assert not _variant_good_enough(
        q_count=30,
        digit_score=6,
        intensity_digits=6,
        agree_proxy=29,
        filled=29,
        intensity_filled=29,
        multi_marked=3,
        name_q=6,
        inset_pen=0,
    )


def test_rejects_incomplete_code():
    assert not _variant_good_enough(
        q_count=30,
        digit_score=4,
        intensity_digits=4,
        agree_proxy=28,
        filled=29,
        intensity_filled=29,
        multi_marked=0,
        name_q=8,
        inset_pen=0,
    )


def test_rejects_high_multi():
    assert not _variant_good_enough(
        q_count=30,
        digit_score=6,
        intensity_digits=6,
        agree_proxy=28,
        filled=29,
        intensity_filled=29,
        multi_marked=10,
        name_q=8,
        inset_pen=0,
    )


def test_rejects_sparse_answers():
    assert not _variant_good_enough(
        q_count=30,
        digit_score=6,
        intensity_digits=6,
        agree_proxy=5,
        filled=5,
        intensity_filled=5,
        multi_marked=0,
        name_q=2,
        inset_pen=0,
    )
