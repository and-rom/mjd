var t;
var mqtt;
var settings;
var metrics;
var reconnectTimeout = 2000;
var topics = [];


$(document).ready(init);

function init() {
    $('#connectionSettingsBtn').click(connectionSettings)
    $("#settingsForm").submit(function( event ) {
        event.preventDefault();
        settings = {
            host: $('#host').val(),
            port: parseInt($('#port').val()),
            username: $('#username').val(),
            password: $('#password').val(),
            clientid: $('#clientid').val()
        }
        storeSettings();
        $('#settingsFormContainer').hide();
    });
    $("#connectBtn").html($('#connectBtn').attr('data-connect-str'));
    $('#connectBtn').click(connect);
    $('#receiveMetricsBtn').click(receiveMetrics);
    loadSettings();
}

function loadSettings() {
    settings = JSON.parse(localStorage.getItem('settings'));
    metrics = JSON.parse(localStorage.getItem('metrics'));
}

function storeSettings() {
    localStorage.setItem('settings', JSON.stringify(settings));
}

function connectionSettings() {
    if ($('#settingsFormContainer').is(":visible")) {
        $('#settingsFormContainer').hide();
    } else {
        if (settings) {
            $('#host').val(settings.host);
            $('#port').val(settings.port);
            $('#username').val(settings.username);
            $('#password').val(settings.password);
            $('#clientid').val(settings.clientid);
        }
        $('#settingsFormContainer').show();
        if ($('#clientid').val() == "") {
            $('#clientid').val("mjd-" + Math.floor(Math.random() * 10000));
        }
    }
}
function connect() {
    MQTTconnect();
}

function disconnect() {
    mqtt.disconnect();
}

function receiveMetrics() {
    mqtt.subscribe("metrics/exchange");
}

function createMetrics() {
    if (metrics == null) return;
    $("#metrics").empty();
    topics = [];
    metrics.forEach(function(metric, idx) {
        var elem = $('#metricTemplate').clone();
        $(elem).click(publish);
        $(elem).attr('id', "id_" + metric.id);
        $(".name", elem).html(metric.name);
        $(elem).appendTo("#metrics");

        updateMetric(idx);

        if ($.inArray(metric.topic, topics) == -1) {
            mqtt.subscribe(metric.topic);
            topics.push(metric.topic);
        }
    });
}

function updateMetric(idx, payload = null, lastActivity = null) {
    var metric = metrics[idx];
    var elem = $('#id_' + metric.id);

    payload = payload !== null ? payload : metric.lastPayload;
    lastActivity = lastActivity !== null ? lastActivity : metric.lastActivity;

    if (metric.jsonPath != "") {
        var targetPayload = payload != "" ? jsonPath(JSON.parse(payload), metric.jsonPath) : payload;
    } else {
        var targetPayload = payload;
    }

    targetPayload = typeof targetPayload !== "undefined" ? targetPayload : metric.payloadOff;

    switch (metric.type) {
        case 1: // text
            $(".body span", elem).removeClass().addClass("mjd-text").addClass("mjd-color" + metric.textColor).html(metric.prefix + targetPayload + metric.postfix);
            break;
        case 2: //switch
            if (targetPayload != metric.payloadOn && payload != metric.payloadOff ) return;
            switch (targetPayload) {
                case metric.payloadOn:
                    var icon = metric.iconOn;
                    var color = metric.onColor;
                    break;
                case metric.payloadOff:
                    var icon = metric.iconOff;
                    var color = metric.offColor;
                    break;
                default:

                    break;
            }
            $(".body span", elem).removeClass().addClass("mjd-icon").addClass("mjd-icon-" + icon).addClass("mjd-color" + color);
            break;
        default:
            console.log("Unknown type");
    }


    $(".last", elem).html(lastActivity != 0 ? elapsed(lastActivity) : "");

    metric.lastPayload = payload;
    if (metric.jsonPath != "") metric.lastJsonPathValue = targetPayload;
    metric.lastActivity = lastActivity;

}

function updateMetricLast() {
    metrics.forEach(function(metric) {
        $('#id_' + metric.id + ' .last').html(metric.lastActivity != 0 ? elapsed(metric.lastActivity) : "");
    });
}

function elapsed (timestamp) {
    var delta = new Date() - new Date(timestamp*1000);

    var i;

    if (delta < 60000) {i = Math.round(delta/1000); return i + ' секунд' + ['у','ы',''][getPluralType(i)] + ' назад';}
    else if (delta < 3600000) {i = Math.round(delta/60000); return i + ' минут' + ['у','ы',''][getPluralType(i)] + ' назад';}
    else if (delta < 86400000 ) {i = Math.round(delta/3600000); return i + ' час' + ['','а','ов'][getPluralType(i)] + ' назад';}
    else if (delta < 2592000000) {i = Math.round(delta/86400000); return i + ' ' + ['день','дня','дней'][getPluralType(i)] + ' назад';}
    else if (delta < 31536000000) {i = Math.round(delta/2592000000); return i + ' месяц' + ['','а','ев'][getPluralType(i)] + ' назад';}
    else {i = Math.round(delta/31536000000); return i + ' ' + ['год','года','лет'][getPluralType(i)] + ' назад';}
}

function getPluralType(number) {
    if (number>=11 && number<=19) {
      return 2;
    } else {
      switch (number % 10) {
        case 1: return 0;
        case 2:
        case 3:
        case 4: return 1;
        default: return 2;
      }
    }
}

function publish(e) {
    var metric = metrics.find((metric) => metric.id === e.currentTarget.id.substring(3));

    if (!metric.enablePub) return;

    if (typeof metric.topicPub != "undefined") {
        var topic = metric.topicPub;
    } else {
        var topic = metric.topic;
    }

    if (metric.jsonPath != "") {
        var lastPayload = metric.lastJsonPathValue;
    } else {
        var lastPayload = metric.lastPayload;
    }

    lastPayload = typeof lastPayload !== "undefined" ? lastPayload : metric.payloadOff;

    switch (metric.type) {
        case 1: // text
            console.log("Text type. TODO");
            break;
        case 2: //switch
            switch (lastPayload) {
                case metric.payloadOn:
                    var payload = metric.payloadOff;
                    break;
                case metric.payloadOff:
                    var payload = metric.payloadOn;
                    break;
            }
            break;
        default:
            console.log("Unknown type");
    }
    $('.loader', e.currentTarget).show();
    mqtt.send(topic, payload, metric.qos, metric.retained);
}

function onConnect() {
    console.log("Connected to " + settings.host);
    $('#connectBtn').off('click',connect);
    $('#connectBtn').click(disconnect);
    $("#connectBtn").html($('#connectBtn').attr('data-disconnect-str'));
    createMetrics();
    t = setInterval(updateMetricLast,1000);
}

function onConnectionLost() {
    console.log("Connection to " + settings.host + " lost");
    $('.loader').hide();
    $('#connectBtn').off('click',disconnect);
    $('#connectBtn').click(connect);
    $("#connectBtn").html($('#connectBtn').attr('data-connect-str'));
    clearInterval(t);
}

function onFailure(message) {
    console.log("Connection attempt to " + settings.host + " failed");
}

function onMessageArrived(msg) {
    console.log(msg.destinationName);
    console.log(msg.payloadString);
    if (msg.destinationName == "metrics/exchange") {
        mqtt.unsubscribe("metrics/exchange");
        metrics = JSON.parse(msg.payloadString);
        localStorage.setItem('metrics', JSON.stringify(metrics));
        createMetrics();
    } else {
        metrics.forEach((metric, idx) => {
            if (metric.topic === msg.destinationName) {
                $('#id_' + metric.id + ' .loader').hide();
                updateMetric(idx, msg.payloadString, Math.trunc(Date.now()/1000));
            }
        })
    }
}

function MQTTconnect() {
    console.log("Connecting to " + settings.host + " " + settings.port );
    mqtt = new Paho.MQTT.Client(settings.host, settings.port, settings.clientid);
    var options = {
        useSSL: true,
        timeout: 3,
        userName: settings.username,
        password: settings.password,
        onSuccess: onConnect,
        onFailure: onFailure
    };
    mqtt.onMessageArrived = onMessageArrived;
    mqtt.onConnectionLost = onConnectionLost;
    mqtt.connect(options);
}
