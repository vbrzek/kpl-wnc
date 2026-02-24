<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { socket } from './socket';

const clientCount = ref<number | null>(null);
const connected = ref(false);

function onConnect() {
  connected.value = true;
}

function onDisconnect() {
  connected.value = false;
  clientCount.value = null;
}

function onClientCount(count: number) {
  clientCount.value = count;
}

onMounted(() => {
  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('server:clientCount', onClientCount);
  socket.connect();
});

onUnmounted(() => {
  socket.off('connect', onConnect);
  socket.off('disconnect', onDisconnect);
  socket.off('server:clientCount', onClientCount);
  socket.disconnect();
});
</script>

<template>
  <main>
    <h1>Karty proti lidskosti</h1>

    <section class="status">
      <p>
        Status:
        <span :class="connected ? 'online' : 'offline'">
          {{ connected ? 'Připojeno' : 'Odpojeno' }}
        </span>
      </p>
      <p v-if="clientCount !== null">
        Připojených klientů: <strong>{{ clientCount }}</strong>
      </p>
    </section>
  </main>
</template>

<style scoped>
main {
  padding: 2rem;
  font-family: sans-serif;
}

.status {
  margin-top: 1rem;
}

.online {
  color: #22c55e;
  font-weight: bold;
}

.offline {
  color: #ef4444;
  font-weight: bold;
}
</style>
