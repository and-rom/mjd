var mqtt;
var settings;
var metrics;
var reconnectTimeout = 2000;
var topics = [];


$(document).ready(init);

function init() {
    $('#connectionSettingsBtn').click(connectionSettings)
    $('#connectBtn').click(connect)
    $('#receiveMetricsBtn').click(receiveMetrics)
    loadSettings()
}

function loadSettings() {
    settings = JSON.parse(localStorage.getItem('settings'));
    if (settings) {
        $('#host').val(settings.host);
        $('#port').val(settings.port);
        $('#username').val(settings.username);
        $('#password').val(settings.password);
        $('#clientid').val(settings.clientid);
    }
    metrics = JSON.parse(localStorage.getItem('metrics'));
}

function storeSettings() {
    localStorage.setItem('settings', JSON.stringify(settings));
}

function connectionSettings() {
    $('#settingsFormContainer').show();
    if ($('#clientid').val() == "") {
        $('#clientid').val("jsmqttdash-" + Math.floor(Math.random() * 10000))
    }
    $("#settingsForm").submit(function( event ) {
        event.preventDefault();
        settings = {
            host: $('#host').val(),
            port: parseInt($('#port').val()),
            username: $('#username').val(),
            password: $('#password').val(),
            clientid: $('#clientid').val()
        }
        storeSettings()
        $('#settingsFormContainer').hide();
    });
}
function connect() {
    MQTTconnect()
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
    metrics.forEach(function(metric, idx) {
        var elem = $('#metricTemplate').clone();
        $(elem).click(publish)
        $(elem).attr('id', "id_" + metric.id);
        $(".name", elem).html(metric.name)
        $(elem).appendTo("#metrics");

        updateMetric(idx);

        if ($.inArray(metric.topic, topics) == -1) {
            mqtt.subscribe(metric.topic);
            topics.push(metric.topic);
        }
    });
}

function updateMetric(idx) {
    var metric = metrics[idx];
    var elem = $('#id_' + metric.id);

    if (metric.jsonPath != "") {
        metric.lastJsonPathValue = metric.lastPayload != "" ? jsonPath(JSON.parse(metric.lastPayload), metric.jsonPath) : metric.lastPayload;
        var payload = metric.lastJsonPathValue;
    } else {
        var payload = metric.lastPayload;
    }

    payload = typeof payload !== "undefined" ? payload : metric.payloadOff;

    switch (metric.type) {
        case 1: // text
            $(".body span", elem).removeClass().addClass("mjd-text").addClass("mjd-color" + metric.textColor).html(metric.prefix + payload + metric.postfix)
            break;
        case 2: //switch
            switch (payload) {
                case metric.payloadOn:
                    var icon = metric.iconOn;
                    var color = metric.onColor;
                    break;
                case metric.payloadOff:
                    var icon = metric.iconOff;
                    var color = metric.offColor;
                    break;
            }
            $(".body span", elem).removeClass().addClass("mjd-icon").addClass("mjd-icon-" + icon).addClass("mjd-color" + color);
            break;
        default:
            console.log("Unknown type");
    }
    
    $(".last", elem).html(metric.lastActivity != 0 ? elapsed(metric.lastActivity) : "");

}

function elapsed (timestamp) {
    var delta = new Date() - new Date(timestamp*1000);

    if (delta < 60000) {return Math.round(delta/1000) + ' seconds ago';}
    else if (delta < 3600000) {return Math.round(delta/60000) + ' minutes ago';}
    else if (delta < 86400000 ) {return Math.round(delta/3600000) + ' hours ago';}
    else if (delta < 2592000000) {return Math.round(delta/86400000) + ' days ago';}
    else if (delta < 31536000000) {return Math.round(delta/2592000000) + ' months ago';}
    else {return Math.round(delta/31536000000) + ' years ago';}
}

function publish(e) {
    var metric = metrics.find((metric) => metric.id === e.currentTarget.id.substring(3));
    
    if (!metric.enablePub) return
    
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
    $("#connectBtn").html('Disconnect');
    createMetrics();
}

function onConnectionLost() {
    console.log("Connection to " + settings.host + " lost");
    $('.loader').hide();
    topics = [];
    $('#connectBtn').off('click',disconnect);
    $('#connectBtn').click(connect);
    $("#connectBtn").html('Connect');
}

function onFailure(message) {
    console.log("Connection attempt to " + settings.host + " failed");
}

function onMessageArrived(msg){
    console.log(msg.destinationName);
    console.log(msg.payloadString);
    if (msg.destinationName == "metrics/exchange") {
        mqtt.unsubscribe("metrics/exchange")
        metrics = JSON.parse(msg.payloadString)
        localStorage.setItem('metrics', JSON.stringify(metrics));
        createMetrics();
    } else {
        metrics.forEach((metric, idx) => {
            if (metric.topic === msg.destinationName) {
                metric.lastPayload = msg.payloadString;
                metric.lastActivity = Math.trunc(Date.now()/1000);
                $('#id_' + metric.id + ' .loader').hide();
                updateMetric(idx);
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
    mqtt.connect(options); //connect
}
