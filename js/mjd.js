var app = {
    //timer: null,
    //mqtt: null,
    settings: null,
    metrics: null,
    //reconnectTimeout: 2000,
    topics: [],

    init: function () {
        $('#connectionSettingsBtn').click(this.connectionSettings.bind(this))
        $("#settingsForm").submit(function( event ) {
            event.preventDefault();
            settings = {
                host: $('#host').val(),
                port: parseInt($('#port').val()),
                username: $('#username').val(),
                password: $('#password').val(),
                clientid: $('#clientid').val(),
                autoconnect: $('#autoconnect').is(":checked")
            }
            this.storeSettings();
            $('#settingsFormContainer').hide();
        });
        $("#connectBtn").prop("title", $('#connectBtn').attr('data-connect-str'));
        $("#connectBtn i").removeClass("mjd-icon-ic_disconnect").addClass("mjd-icon-ic_connect");
        $('#connectBtn').click(this.connect.bind(this));
        $('#receiveMetricsBtn').click(this.receiveMetrics.bind(this));
        this.loadSettings();
        if (this.settings.autoconnect) this.connect();
    },

    loadSettings: function () {
        this.settings = JSON.parse(localStorage.getItem('settings'));
        this.metrics = JSON.parse(localStorage.getItem('metrics'));
    },

    storeSettings: function () {
        localStorage.setItem('settings', JSON.stringify(this.settings));
    },

    connectionSettings: function () {
        if ($('#settingsFormContainer').is(":visible")) {
            $('#settingsFormContainer').hide();
        } else {
            if (this.settings) {
                $('#host').val(this.settings.host);
                $('#port').val(this.settings.port);
                $('#username').val(this.settings.username);
                $('#password').val(this.settings.password);
                $('#clientid').val(this.settings.clientid);
                $('#autoconnect').prop('checked', this.settings.autoconnect);
            }
            $('#settingsFormContainer').show();
            if ($('#clientid').val() == "") {
                $('#clientid').val("mjd-" + Math.floor(Math.random() * 10000));
            }
        }
    },

    receiveMetrics: function () {
        this.mqtt.subscribe("metrics/exchange");
    },

    createMetrics: function () {
        if (this.metrics == null) return;
        $("#metrics").empty();
        this.topics = [];
        this.metrics.forEach((metric, idx) => {
            var elem = $('#metricTemplate').clone();
            $(elem).click(this.metricPublish.bind(this));
            $(elem).attr('id', "id_" + metric.id);
            $(elem).attr('title', metric.topic.split("/", 1)[0]);
            $(".name", elem).html(metric.name);
            $(elem).appendTo("#metrics");

            this.updateMetric(idx);

            if ($.inArray(metric.topic, this.topics) == -1) {
                this.mqtt.subscribe(metric.topic);
                this.topics.push(metric.topic);
            }
        });
    },

    updateMetric: function (idx, payload = null, lastActivity = null) {
        var metric = this.metrics[idx];
        var elem = $('#id_' + metric.id);

        payload = payload !== null ? payload : metric.lastPayload ? metric.lastPayload : "";
        lastActivity = lastActivity !== null ? lastActivity : metric.lastActivity ? metric.lastActivity : "";

        if (metric.jsonPath != "") {
            var targetPayload = payload != "" ? jsonPath(JSON.parse(payload), metric.jsonPath) : payload;
        } else {
            var targetPayload = payload;
        }

        targetPayload = typeof targetPayload !== "undefined" ? targetPayload : metric.payloadOff;

        switch (metric.type) {
            case 1: // text
                $(".body span", elem).removeClass().addClass("mjd-text").addClass("mjd-color" + metric.textColor).html(metric.prefix + targetPayload + metric.postfix);
                fitty("#id_" + metric.id + " .body .mjd-text", { maxSize: 160 });
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


        $(".last", elem).html(lastActivity != 0 ? this.elapsed(lastActivity)[1] : "");

        metric.lastPayload = payload;
        if (metric.jsonPath != "") metric.lastJsonPathValue = targetPayload;
        metric.lastActivity = lastActivity;

    },

    updateMetricLast: function () {
        if (!this.metrics) return;
        this.metrics.forEach((metric) => {
            var el = this.elapsed(metric.lastActivity);
            $('#id_' + metric.id + ' .last').html(metric.lastActivity != 0 ? el[1] : "");
            if (metric.jsBlinkExpression != "") {
                var val = metric.jsonPath != "" ? metric.lastJsonPathValue : metric.lastPayload;
                val = typeof val === 'string' ? "\"" + val + "\"" : val;
                if (eval(metric.jsBlinkExpression.replace(/val/g, val).replace(/secs/g, el[0]))) {
                    $('#id_' + metric.id).toggleClass('blink');
                } else {
                    $('#id_' + metric.id).removeClass('blink');
                }
            }
        });
    },

    elapsed: function  (timestamp) {
        var delta = Math.round((new Date() - new Date(timestamp*1000))/1000);

        var i;

        if (delta < 60) {i = delta; return [delta, i + ' секунд' + ['у','ы',''][this.getPluralType(i)] + ' назад'];}
        else if (delta < 3600) {i = Math.round(delta/60); return [delta, i + ' минут' + ['у','ы',''][this.getPluralType(i)] + ' назад'];}
        else if (delta < 86400 ) {i = Math.round(delta/3600); return [delta, i + ' час' + ['','а','ов'][this.getPluralType(i)] + ' назад'];}
        else if (delta < 2592000) {i = Math.round(delta/86400); return [delta, i + ' ' + ['день','дня','дней'][this.getPluralType(i)] + ' назад'];}
        else if (delta < 31536000) {i = Math.round(delta/2592000); return [delta, i + ' месяц' + ['','а','ев'][this.getPluralType(i)] + ' назад'];}
        else {i = Math.round(delta/31536000); return [delta, i + ' ' + ['год','года','лет'][this.getPluralType(i)] + ' назад'];}
    },

    getPluralType: function (number) {
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
    },

    publish: function (e) {
        var metric = this.metrics.find((metric) => metric.id === e.currentTarget.id.substring(3));

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
        this.mqtt.send(topic, payload, metric.qos, metric.retained);
    },

    connect: function () {
        console.log("Connecting to " + this.settings.host + " " + this.settings.port );
        this.mqtt = new Paho.Client(this.settings.host, this.settings.port, this.settings.clientid);
        this.mqtt.onConnected = this.onConnected.bind(this);
        this.mqtt.onConnectionLost = this.onConnectionLost.bind(this);
        this.mqtt.onMessageArrived = this.onMessageArrived.bind(this);
        this.mqtt.connect({
            useSSL: true,
            timeout: 3,
            userName: this.settings.username,
            password: this.settings.password,
            onSuccess: this.onSuccess,
            onFailure: this.onFailure,
            invocationContext: this
        });
    },

    disconnect: function () {
        this.mqtt.disconnect();
    },

    onSuccess: function (responseObject) {
        let self = responseObject.invocationContext;
        console.log("Connection attempt to " + self.settings.host + " succeed");
    },

    onFailure: function (responseObject) {
        let self = responseObject.invocationContext;
        console.log("Connection attempt to " + self.settings.host + " failed");
    },

    onConnected: function () {
        console.log("Connected to " + this.settings.host);
        $('#connectBtn').off('click', this.connect);
        $('#connectBtn').click(this.disconnect.bind(this));
        $("#connectBtn").prop("title", $('#connectBtn').attr('data-disconnect-str'));
        $("#connectBtn i").removeClass("mjd-icon-ic_connect").addClass("mjd-icon-ic_disconnect");
        this.createMetrics();
        this.timer = setInterval(this.updateMetricLast.bind(this),1000);
    },

    onConnectionLost: function (responseObject) {
        console.log("Connection to " + this.settings.host + " lost");
        if (responseObject.errorCode !== 0) {
            console.log(responseObject.errorMessage);
        }
        $('.loader').hide();
        $('#connectBtn').off('click' ,this.disconnect);
        $('#connectBtn').click(this.connect.bind(this));
        $("#connectBtn").prop("title", $('#connectBtn').attr('data-connect-str'));
        $("#connectBtn i").removeClass("mjd-icon-ic_disconnect").addClass("mjd-icon-ic_connect");
        clearInterval(this.timer);
    },

    onMessageArrived: function (msg) {
        console.log(msg.destinationName);
        console.log(msg.payloadString);
        if (msg.destinationName == "metrics/exchange") {
            this.mqtt.unsubscribe("metrics/exchange");
            this.metrics = JSON.parse(msg.payloadString);
            localStorage.setItem('metrics', JSON.stringify(this.metrics));
            this.createMetrics();
        } else {
            this.metrics.forEach((metric, idx) => {
                if (metric.topic === msg.destinationName) {
                    $('#id_' + metric.id + ' .loader').hide();
                    this.updateMetric(idx, msg.payloadString, Math.trunc(Date.now()/1000));
                }
            });
        }
    }
}

$(document).ready(app.init());
