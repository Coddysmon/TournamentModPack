#!/bin/sh
# Включение TLS у узла связи.
#
# ЗАЧЕМ. Порт 443 выбран ради проходимости, но говорит по нему наш сырой
# протокол. Часть посредников — прежде всего VPN-провайдеры — смотрит на 443
# глубже номера порта и ждёт там настоящего рукопожатия TLS. Не увидев, рвёт
# соединение. Поэтому игравшие через VPN не могли нормально войти в лобби.
#
# Приветствие узла остаётся ДО TLS: без него данные клиента пропадают на пути
# от домашних провайдеров. Порядок такой — приветствие, потом рукопожатие.
#
# СТАРЫЕ КЛИЕНТЫ ПРОДОЛЖАЮТ РАБОТАТЬ: узел различает их по первым байтам.
set -e

URL="https://raw.githubusercontent.com/Coddysmon/TournamentModPack/main/server/nova-relay"
SHA="3a539a2484f59e62069155443a0bf1e045c0eee1ec42b82cac82f2330437c767"
CERT=/var/lib/nova-relay/relay.pfx
UNIT=/etc/systemd/system/nova-relay.service

echo "!! ПЕРЕЗАПУСК УЗЛА РАЗОРВЁТ ЖИВЫЕ ПАРТИИ."
echo "   Если сейчас кто-то играет — прерви (Ctrl+C) и вернись позже."
echo "   Продолжаю через 10 секунд..."
sleep 10

echo "== качаю =="
curl -fL --retry 3 -o /tmp/nova-relay "$URL"
GOT=$(sha256sum /tmp/nova-relay | cut -d" " -f1)
if [ "$GOT" != "$SHA" ]; then
    echo "  НЕ СОШЁЛСЯ ХЕШ"
    echo "  получено:  $GOT"
    echo "  ожидалось: $SHA"
    exit 1
fi
echo "  сошёлся"

echo "== готовлю место для сертификата =="
mkdir -p /var/lib/nova-relay
# Владелец — тот же пользователь, под которым идёт служба: иначе она не сможет
# ни прочитать сертификат, ни выпустить его при первом запуске.
OWNER=$(sed -n 's/^User=//p' "$UNIT" | head -1)
[ -n "$OWNER" ] && chown -R "$OWNER" /var/lib/nova-relay || true
chmod 700 /var/lib/nova-relay

echo "== вписываю --cert в unit =="
if grep -q -- "--cert" "$UNIT"; then
    echo "  уже вписан"
else
    cp "$UNIT" "$UNIT.bak_pre_tls"
    # Дописываем к существующей строке, а не пишем свою: в ней есть путь к
    # журналу и прочее, чего мы отсюда не знаем.
    sed -i "s|^\(ExecStart=.*\)$|\1 --cert $CERT|" "$UNIT"
    echo "  дописан, прежний unit сохранён в $UNIT.bak_pre_tls"
fi
grep "^ExecStart=" "$UNIT"

echo "== ставлю и запускаю =="
systemctl stop nova-relay 2>/dev/null || true
install -m 0755 /tmp/nova-relay /usr/local/bin/nova-relay
systemctl daemon-reload
systemctl start nova-relay
sleep 3
systemctl is-active --quiet nova-relay || {
    echo "  УЗЕЛ НЕ ПОДНЯЛСЯ: journalctl -u nova-relay -n 40"
    exit 1
}

echo
echo "== ОТПЕЧАТОК ДЛЯ МАНИФЕСТА =="
journalctl -u nova-relay -n 60 --no-pager | grep -A1 "TLS" | tail -4
echo
echo "Скопируй строку вида --relay-tls-key <64 знака> и отдай её Клоду."
