import sys
import torch

def verify():
    print(f"Python Version: {sys.version}")
    print(f"Torch Version: {torch.__version__}")
    
    cuda_avail = torch.cuda.is_available()
    print(f"CUDA Available: {cuda_avail}")
    
    if cuda_avail:
        print(f"Device Count: {torch.cuda.device_count()}")
        print(f"Current Device: {torch.cuda.current_device()}")
        print(f"Device Name: {torch.cuda.get_device_name(0)}")
        
        # Test Tensor Operation
        print("\nTesting Tensor Operation on GPU:")
        try:
            x = torch.rand(5, 3).cuda()
            print(f"Tensor on GPU: {x}")
            print("Success!")
        except Exception as e:
            print(f"Tensor Error: {e}")
    else:
        print("Running on CPU.")

if __name__ == "__main__":
    verify()
