# Compiler and flags
CC = gcc
CFLAGS = -Wall -Wextra -O2
LDFLAGS = -lws2_32

# Target executable name
TARGET = collector.exe

# Source files
SRCS = collector.c

# Build target
all: $(TARGET)

$(TARGET): $(SRCS)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRCS) $(LDFLAGS)

# Clean target for removing built files
clean:
	cmd /c del /f /q $(TARGET)

.PHONY: all clean
