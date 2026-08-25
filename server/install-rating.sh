#!/bin/sh
# Установка службы рейтинга Nova. Запускать от root:  sh /tmp/b.sh
#
# Программу качаем с raw.githubusercontent.com. Хранилище релизов не годится:
# скачивание оттуда уходит на objects.githubusercontent.com, а он с этого
# сервера закрыт наглухо — проверено, SSL-таймаут за пять минут и ноль байт.
set -e

BIN_URL="https://raw.githubusercontent.com/Coddysmon/TournamentModPack/main/server/nova-rating"
BIN_SHA="d64244cb87e82a72a8b5c067c07208ecca73f19ae7b45be1f1052ff70c870e8f"

echo "== качаю программу (36 МБ) =="
curl -fL --retry 3 -o /tmp/nova-rating "$BIN_URL"

echo "== сверяю =="
GOT=$(sha256sum /tmp/nova-rating | cut -d" " -f1)
if [ "$GOT" != "$BIN_SHA" ]; then
    echo "  НЕ СОШЁЛСЯ ХЕШ"
    echo "  получено: $GOT"
    echo "  ожидалось: $BIN_SHA"
    exit 1
fi
echo "  сошёлся"

echo "== пользователь =="
id nova-rating >/dev/null 2>&1 || \
    useradd --system --no-create-home --shell /usr/sbin/nologin nova-rating
echo "  ok"

echo "== папки =="
mkdir -p /opt/nova-rating /var/lib/nova-rating
touch /var/log/nova-rating.log
chown nova-rating:nova-rating /var/lib/nova-rating /var/log/nova-rating.log
echo "  ok"

echo "== программа =="
systemctl stop nova-rating 2>/dev/null || true
install -m 0755 /tmp/nova-rating /opt/nova-rating/nova-rating
echo "  ok"

echo "== служба =="
cat > /etc/systemd/system/nova-rating.service <<'UNIT'
[Unit]
Description=Nova rating service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nova-rating
Group=nova-rating
ExecStart=/opt/nova-rating/nova-rating --bind 0.0.0.0 --port 45445 --ledger /var/lib/nova-rating/matches.jsonl --log /var/log/nova-rating.log --min-reports 2
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
systemctl enable nova-rating >/dev/null 2>&1 || true
systemctl restart nova-rating
echo "  ok"

echo "== проверка =="
sleep 2
systemctl is-active --quiet nova-rating || {
    echo "  НЕ ПОДНЯЛАСЬ. Смотри: journalctl -u nova-rating -n 40"
    exit 1
}
curl -sf -m 5 http://127.0.0.1:45445/health >/dev/null && echo "  отвечает" || {
    echo "  не отвечает на /health"
    exit 1
}

echo
echo "  Служба слушает 45445. Если включён экран, открой порт:"
echo "     ufw allow 45445/tcp"
echo
echo "ГОТОВО."
