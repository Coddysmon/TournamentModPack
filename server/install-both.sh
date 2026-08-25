#!/bin/sh
# Обновление узла связи и службы рейтинга. Запускать от root:  sh /tmp/b.sh
#
# Узел учится узнавать обращения по HTTP на своём порту и уводить их рейтингу.
# Рейтинг переезжает на localhost — снаружи к нему теперь ходят через узел.
#
# Своим портом рейтинг стоять не может: на пути от домашних провайдеров данные
# клиента пропадают, пока сервер не заговорит первым. Узел это знает и
# здоровается до чтения, поэтому через него проходит.
set -e

RATING_URL="https://raw.githubusercontent.com/Coddysmon/TournamentModPack/main/server/nova-rating"
RATING_SHA="8c72a3c315a5c6377c68c5f6d3d0d7936f207d857ef4cda3bd8a9a1e36e2c099"
RELAY_URL="https://raw.githubusercontent.com/Coddysmon/TournamentModPack/main/server/nova-relay"
RELAY_SHA="3efbe7aee38eda2a1032e5ed23dc72ee5942c39968674320e68d41247bccf3ec"

echo "!! ПЕРЕЗАПУСК УЗЛА РАЗОРВЁТ ЖИВЫЕ ПАРТИИ."
echo "   Если сейчас кто-то играет — прерви (Ctrl+C) и вернись позже."
echo "   Продолжаю через 10 секунд..."
sleep 10

fetch () {
    echo "== качаю $3 =="
    curl -fL --retry 3 -o "$2" "$1"
    GOT=$(sha256sum "$2" | cut -d" " -f1)
    if [ "$GOT" != "$4" ]; then
        echo "  НЕ СОШЁЛСЯ ХЕШ у $3"
        echo "  получено:  $GOT"
        echo "  ожидалось: $4"
        exit 1
    fi
    echo "  сошёлся"
}

fetch "$RATING_URL" /tmp/nova-rating "рейтинг" "$RATING_SHA"
fetch "$RELAY_URL" /tmp/nova-relay "узел связи" "$RELAY_SHA"

echo "== рейтинг: переезд на localhost =="
systemctl stop nova-rating 2>/dev/null || true
install -m 0755 /tmp/nova-rating /opt/nova-rating/nova-rating
cat > /etc/systemd/system/nova-rating.service <<'UNIT'
[Unit]
Description=Nova rating service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nova-rating
Group=nova-rating
# Только localhost: наружу служба больше не торчит, обращения приходят
# через узел связи, который умеет прогреть путь.
ExecStart=/opt/nova-rating/nova-rating --bind 127.0.0.1 --port 45445 --ledger /var/lib/nova-rating/matches.jsonl --log /var/log/nova-rating.log --min-reports 2
Restart=always
RestartSec=5
ReadWritePaths=/var/lib/nova-rating /var/log
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl restart nova-rating
sleep 2
systemctl is-active --quiet nova-rating || {
    echo "  РЕЙТИНГ НЕ ПОДНЯЛСЯ: journalctl -u nova-rating -n 30"
    exit 1
}
curl -sf -m 5 http://127.0.0.1:45445/health >/dev/null && echo "  отвечает на localhost" || {
    echo "  не отвечает"
    exit 1
}

echo "== узел связи =="
systemctl stop nova-relay 2>/dev/null || true
install -m 0755 /tmp/nova-relay /usr/local/bin/nova-relay
systemctl start nova-relay
sleep 2
systemctl is-active --quiet nova-relay || {
    echo "  УЗЕЛ НЕ ПОДНЯЛСЯ: journalctl -u nova-relay -n 30"
    exit 1
}
echo "  работает"

echo "== сквозная проверка: рейтинг через узел =="
# Первые шесть байт — приветствие узла, его надо проглотить. Обычный curl так
# не умеет, поэтому проверяем малым скриптом.
python3 - <<'PY'
import socket, struct, sys
s = socket.create_connection(('127.0.0.1', 443), timeout=10)
s.settimeout(10)
n = struct.unpack('<I', s.recv(4))[0]
s.recv(n)
s.sendall(b'GET /health HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
data = b''
while True:
    c = s.recv(1024)
    if not c:
        break
    data += c
s.close()
if b'200' in data and b'ok' in data:
    print('  боковая дверь работает')
else:
    print('  БОКОВАЯ ДВЕРЬ НЕ ОТВЕТИЛА:', data[:120])
    sys.exit(1)
PY

echo
echo "ГОТОВО. Рейтинг доступен снаружи по адресу relay://109.73.196.175:443"
