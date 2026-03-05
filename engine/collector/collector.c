#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib")

#define BUFFER_SIZE 65535
#define INTERNAL_PORT 5001 // The port the Python brain.py is listening on
#define LISTENING_PORT 5000 // The port this collector listens on

int main() {
    WSADATA wsa;
    SOCKET listen_sock, forward_sock;
    struct sockaddr_in server_addr, brain_addr;
    char buffer[BUFFER_SIZE];
    int recv_len;
    struct sockaddr_in client_addr;
    int client_addr_len = sizeof(client_addr);

    // Initialize Winsock
    printf("[Collector] Initializing Winsock...\n");
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        printf("Failed. Error Code : %d\n", WSAGetLastError());
        return 1;
    }

    // Create Listen Socket (UDP)
    if ((listen_sock = socket(AF_INET, SOCK_DGRAM, 0)) == INVALID_SOCKET) {
        printf("Could not create listen socket : %d\n", WSAGetLastError());
        WSACleanup();
        return 1;
    }
    
    // Increase receive buffer to 4MB to prevent drops
    int rcvbuf = 4 * 1024 * 1024;
    setsockopt(listen_sock, SOL_SOCKET, SO_RCVBUF, (char*)&rcvbuf, sizeof(rcvbuf));

    // Prepare the sockaddr_in structure for listening
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(LISTENING_PORT);

    // Bind
    if (bind(listen_sock, (struct sockaddr *)&server_addr, sizeof(server_addr)) == SOCKET_ERROR) {
        printf("Bind failed with error code : %d\n", WSAGetLastError());
        closesocket(listen_sock);
        WSACleanup();
        return 1;
    }

    // Create Forward Socket (UDP)
    if ((forward_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)) == INVALID_SOCKET) {
        printf("Could not create forward socket: %d\n", WSAGetLastError());
        closesocket(listen_sock);
        WSACleanup();
        return 1;
    }

    // Prepare address of Python engine (localhost:5001)
    brain_addr.sin_family = AF_INET;
    brain_addr.sin_port = htons(INTERNAL_PORT);
    brain_addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    printf("[Collector] Started listening on UDP %d. Forwarding to UDP %d (Python Engine).\n", LISTENING_PORT, INTERNAL_PORT);

    while(1) {
        // Receive data
        recv_len = recvfrom(listen_sock, buffer, BUFFER_SIZE, 0, (struct sockaddr *) &client_addr, &client_addr_len);
        if (recv_len == SOCKET_ERROR) {
            printf("recvfrom() failed with error code : %d\n", WSAGetLastError());
            continue;
        }

        // Forward data verbatim to the internal engine port
        if (sendto(forward_sock, buffer, recv_len, 0, (struct sockaddr *)&brain_addr, sizeof(brain_addr)) == SOCKET_ERROR) {
            // Optional: log or handle send errors if necessary
            // printf("sendto() failed with error code : %d\n", WSAGetLastError());
        }
    }

    closesocket(listen_sock);
    closesocket(forward_sock);
    WSACleanup();

    return 0;
}
