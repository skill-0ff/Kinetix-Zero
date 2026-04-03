import unittest
from unittest.mock import MagicMock, patch
import sys
import os
import torch
import uuid

# Add paths for imports
sys.path.append(os.path.join(os.getcwd(), "engine", "core"))
sys.path.append(os.path.join(os.getcwd(), "engine", "ai"))

import kinetix_pb2
from inference import UnsupervisedAI

class TestBinaryPipeline(unittest.TestCase):
    def setUp(self):
        # Mock Redis and Qdrant to avoid connection errors
        self.patcher_redis = patch('redis.Redis')
        self.patcher_qdrant = patch('qdrant_client.QdrantClient')
        
        self.mock_redis = self.patcher_redis.start()
        self.mock_qdrant = self.patcher_qdrant.start()
        
        # Instantiate AI with a dummy config
        # We'll mock load_config so it doesn't fail on missing file
        with patch.object(UnsupervisedAI, 'load_config', return_value={}):
             self.ai = UnsupervisedAI("dummy_config.jsonc")
             self.ai.redis_out = MagicMock()
             self.ai.memory = MagicMock()

    def tearDown(self):
        self.patcher_redis.stop()
        self.patcher_qdrant.stop()

    def test_decoration_and_redis_push(self):
        """Verify that process_batch decorates the Protobuf packet and pushes it to Redis."""
        # 1. Create a mock packet
        pkt = kinetix_pb2.KinetixPacket()
        pkt.role = "TEST"
        pkt.auth.key = "secret_key" 
        
        # 2. Setup AI state
        # Simulate a batch with one packet
        self.ai.log_batch_queue = [[pkt]]
        
        # Mock model output
        # Model returns (recon_x, mu, logvar)
        self.ai.model = MagicMock(return_value=(
            torch.zeros((1, 1, 34)), # recon
            torch.zeros((1, 1, 64)),  # mu
            torch.zeros((1, 1, 64))   # logvar
        ))
        
        # Simulate a window of 1 packet with maturity score (index 5) = 1.1
        import numpy as np
        new_window = np.zeros((1, 34))
        new_window[0, 5] = 1.1 
        
        # Mock Qdrant search results
        self.ai.memory.search_batch.return_value = [[]]
        
        # 3. Run process_batch
        # Force an anomaly by mocking the loss.
        with patch('torch.sum', return_value=torch.tensor([[5.0]])): # Force high loss
            self.ai.process_batch(new_window)
        
        # 4. Verify Redis Push
        self.ai.redis_out.rpush.assert_called()
        args = self.ai.redis_out.rpush.call_args[0]
        self.assertEqual(args[0], "kinetix_storage")
        
        # Parse the pushed data
        pushed_pkt = kinetix_pb2.KinetixPacket()
        pushed_pkt.ParseFromString(args[1])
        
        # 5. Assertions
        print(f"[*] Verified UUID: {pushed_pkt.uuid}")
        print(f"[*] Verified Verdict: {pushed_pkt.ai_verdict}")
        print(f"[*] Verified Score: {pushed_pkt.ai_anomaly_score:.4f}")
        
        self.assertTrue(len(pushed_pkt.uuid) > 0)
        self.assertTrue(len(pushed_pkt.ai_verdict) > 0)
        # Any score is fine for binary flow test
        
        # Verify Qdrant link
        self.ai.memory.upsert.assert_called()
        upsert_args = self.ai.memory.upsert.call_args[1]
        self.assertEqual(upsert_args['points'][0].id, pushed_pkt.uuid)
        print("[SUCCESS] Logic verification passed: UUIDs match and Protobuf is decorated.")

if __name__ == "__main__":
    test = TestBinaryPipeline()
    test.setUp()
    try:
        test.test_decoration_and_redis_push()
    finally:
        test.tearDown()
