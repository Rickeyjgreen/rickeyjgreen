import threading

import numpy as np

from actionshots_qa.models import FaceEngine


def test_expression_model_happy_output_becomes_high_portrait_score():
    class FakeNet:
        def setInput(self, blob, name):
            assert name == "data"

        def forward(self, names):
            assert names == ["label"]
            return [np.array([[0, 0, 0, 8, 0, 0, 0]], dtype=np.float32)]

    engine = FaceEngine.__new__(FaceEngine)
    engine._expression_model = FakeNet()
    engine._expression_lock = threading.Lock()
    engine._aligned_crop = lambda image, face: np.zeros((112, 112, 3), dtype=np.uint8)
    label, confidence, score = engine.expression(
        np.zeros((112, 112, 3), dtype=np.uint8), np.zeros(15, dtype=np.float32)
    )
    assert label == "happy"
    assert confidence > 0.99
    assert score > 0.99

