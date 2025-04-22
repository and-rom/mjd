const APP_NAME = 'MJD';
const storageKey = key => `${APP_NAME}.${key}`;
const storageSet = (key, value) => localStorage.setItem(storageKey(key), value);
const storageGet = key => localStorage.getItem(storageKey(key));

var metric$ = {
    blink: null,
    color: "",
    data: "",
    iconColor: "",
    lastActivityString: "",
    name: "",
    on: null,
    payload: "",
    preventDefault: null,
    progress: null,
    progressColor: null,
    text: null,
    textColor: null,
    topic: "",
    url: "",
    getLastPayload: function () {
        return this.lastPayload;
    },
    getSecondsSinceLastActivity: function () {
        return Math.round((new Date() - new Date(this.lastActivity*1000))/1000);
    }
}

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
            this.settings = {
                host: $('#host').val(),
                ssl: $('#ssl').is(":checked"),
                port: parseInt($('#port').val()),
                username: $('#username').val(),
                password: $('#password').val(),
                clientid: $('#clientid').val(),
                autoconnect: $('#autoconnect').is(":checked")
            }
            this.storeSettings();
            $('#settingsFormContainer').hide();
        }.bind(this));
        $("#connectBtn").prop("title", $('#connectBtn').attr('data-connect-str'));
        $("#connectBtn i").removeClass("mjd-icon-ic_disconnect").addClass("mjd-icon-ic_connect");
        $('#connectBtn').on('click', this.connect.bind(this));
        $('#receiveMetricsBtn').click(this.receiveMetrics.bind(this));
        this.loadSettings();
        if (this.settings && this.settings.autoconnect) this.connect();
    },

    loadSettings: function () {
        this.settings = JSON.parse(storageGet('settings'));
        this.metrics = JSON.parse(storageGet('metrics'));
    },

    storeSettings: function () {
        storageSet('settings', JSON.stringify(this.settings));
    },

    connectionSettings: function () {
        if ($('#settingsFormContainer').is(":visible")) {
            $('#settingsFormContainer').hide();
        } else {
            if (this.settings) {
                $('#host').val(this.settings.host);
                $('#ssl').prop('checked', this.settings.ssl);
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
        this.settings.exchangeTopic = prompt("Топик", "metrics/exchange");
        this.storeSettings();
        this.mqtt.subscribe(this.settings.exchangeTopic);
    },

    createMetrics: function () {
        if (this.metrics == null) return;
        $("#metrics").empty();
        this.topics = [];
        this.metrics.forEach((metric, idx) => {
            metric.__proto__ = metric$;

            var elem = $('#metricTemplate').clone();
            $(elem).click(this.metricTap.bind(this));
            $(elem).attr('id', "id_" + metric.id);
            $(elem).attr('title', metric.topic.split("/", 1)[0]);
            $(".name", elem).html(metric.name);
            $(elem).appendTo("#metrics");

            this.updateMetric(idx);

            if (metric.topic != "" && $.inArray(metric.topic, this.topics) == -1) {
                this.mqtt.subscribe(metric.topic);
                this.topics.push(metric.topic);
            }
        });
    },

    updateMetric: function (idx) {
        var metric = this.metrics[idx];
        var elem = $('#id_' + metric.id);

        metric.payload = metric.payload ? metric.payload : metric.lastPayload ? metric.lastPayload : "";
        metric.lastActivity = metric.activity ? metric.activity : metric.lastActivity ? metric.lastActivity : "";

        if (metric.jsOnReceive != "") {
            try {
                eval(metric.jsOnReceive.replace(/event\./g, "metric.").replace(/app\./g, "this."));
            } catch (error) {
                console.error(error);
            }
        }

        if (metric.jsonPath != "") {
            var targetPayload = metric.payload != "" ? jsonPath(JSON.parse(metric.payload), metric.jsonPath)[0] : metric.payload;
        } else {
            var targetPayload = metric.payload;
        }

        targetPayload = typeof targetPayload !== "undefined" ? targetPayload : metric.payloadOff;

        metric.lastPayload = metric.payload;
        if (metric.jsonPath != "") metric.lastJsonPathValue = targetPayload;

        if (metric.jsOnDisplay != "") {
            eval(metric.jsOnDisplay.replace(/event\./g, "metric.").replace(/app\./g, "this."));
        }

        let textColorClass, textColor, text;
        switch (metric.type) {
            case 1: // text
                textColorClass = "mjd-color" + (Number.isInteger(metric.textColor) && metric.textColor < 0 ? metric.textColor : "");
                textColor = textColorClass == "mjd-color" ? { 'color': metric.textColor } : {};
                text = metric.prefix + targetPayload + metric.postfix
                $(".body span", elem).removeClass().addClass("mjd-text").addClass(textColorClass).css(textColor).html(text);
                fitty("#id_" + metric.id + " .body .mjd-text", {minSize: 10, maxSize: {"SMALL":30, "MEDIUM":60, "LARGE":90}[metric.mainTextSize] });
                break;
            case 2: //switch
                switch (targetPayload) {
                    case metric.payloadOn:
                        var icon = metric.iconOn;
                        var color = metric.onColor;
                        break;
                    case metric.payloadOff:
                    default:
                        var icon = metric.iconOff;
                        var color = metric.offColor;
                        break;
                }
                $(".body span", elem).removeClass().addClass("mjd-icon").addClass("mjd-icon-" + icon).addClass("mjd-color" + color);
                break;
            case 3: //range
                console.log("Unknown type");
                break;
            case 4: //select
                textColorClass = "mjd-color" + (Number.isInteger(metric.textColor) && metric.textColor < 0 ? metric.textColor : "");
                textColor = textColorClass == "mjd-color" ? { 'color': metric.textColor } : {};
                text = typeof metric.items != 'undefined' && metric.items.length > 0 ? metric.items.find(m => m.payload === targetPayload).label : "";
                $(".body span", elem).removeClass().addClass("mjd-text").addClass(textColorClass).css(textColor).html(text);
                fitty("#id_" + metric.id + " .body .mjd-text", {minSize: 10, maxSize: {"SMALL":30, "MEDIUM":60, "LARGE":90}[metric.mainTextSize] });
                break;
            case 5: //image
                $(".body img", elem).attr('src', targetPayload);
                break;
            default:
                console.log("Unknown type");
        }

        $(".last", elem).html(metric.lastActivity != 0 ? this.elapsed(metric.getSecondsSinceLastActivity())[1] : "");

    },

    updateMetricLast: function () {
        if (!this.metrics) return;
        this.metrics.forEach((metric) => {
            var el = this.elapsed(metric.getSecondsSinceLastActivity());
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

    elapsed: function  (seconds) {
        var i;

        if (seconds < 60) {i = seconds; return [seconds, i + ' секунд' + ['у','ы',''][this.getPluralType(i)] + ' назад'];}
        else if (seconds < 3600) {i = Math.round(seconds/60); return [seconds, i + ' минут' + ['у','ы',''][this.getPluralType(i)] + ' назад'];}
        else if (seconds < 86400 ) {i = Math.round(seconds/3600); return [seconds, i + ' час' + ['','а','ов'][this.getPluralType(i)] + ' назад'];}
        else if (seconds < 2592000) {i = Math.round(seconds/86400); return [seconds, i + ' ' + ['день','дня','дней'][this.getPluralType(i)] + ' назад'];}
        else if (seconds < 31536000) {i = Math.round(seconds/2592000); return [seconds, i + ' месяц' + ['','а','ев'][this.getPluralType(i)] + ' назад'];}
        else {i = Math.round(seconds/31536000); return [seconds, i + ' ' + ['год','года','лет'][this.getPluralType(i)] + ' назад'];}
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

    metricTap: function (e) {
        var metric = this.metrics.find((metric) => metric.id === e.currentTarget.id.substring(3));

        if (metric.jsOnTap != "") {
            eval(metric.jsOnTap.replace(/event\./g, "metric.").replace(/app\./g, "this."));
        }

        if (!metric.enablePub || metric.preventDefault) return;

        if (typeof metric.topicPub != "undefined" && metric.topicPub !== "") {
            var topic = metric.topicPub;
        } else {
            var topic = metric.topic;
        }

        if (topic === "") return;

        if (metric.jsonPath != "") {
            var lastPayload = metric.lastJsonPathValue;
        } else {
            var lastPayload = metric.lastPayload;
        }

        switch (metric.type) {
            case 1: // text
                $('#text-modal #confirmBtn').click((event) => {
                    event.preventDefault();
                    var payload = $('#text').val();
                    $('#text').val("");
                    $('#text-modal')[0].close();
                    this.metricPublish(e, topic, payload, metric.retained, metric.qos);
                });
                $('#text-modal')[0].showModal();
                return;
                break;
            case 2: //switch
                lastPayload = typeof lastPayload !== "undefined" ? lastPayload : metric.payloadOff;
                switch (lastPayload) {
                    case metric.payloadOn:
                        var payload = metric.payloadOff;
                        break;
                    case metric.payloadOff:
                        var payload = metric.payloadOn;
                        break;
                }
                this.metricPublish(e, topic, payload, metric.retained, metric.qos);
                break;
            case 3: //range
                console.log("Unknown type");
                break;
            case 4: //selecet
                lastPayload = typeof lastPayload !== "undefined" ? lastPayload : metric.payloadOff;
                metric.items.forEach(item => {
                    let elem = $('#select-modal p:first').clone();
                    $('input', elem).attr("value", item.payload);
                    $('span', elem).html(item.label);
                    $('span', elem).html(item.label);
                    if (lastPayload == item.payload) $('input', elem).prop('checked', true);
                    $("#select-modal form p:last").after(elem);
                    $(elem).show();
                    $('input[name="radio"]', elem).click((event) => {
                        var payload = $(event.target).val();
                        $('#select-modal')[0].close();
                        $("#select-modal p").not(':first').remove();
                        this.metricPublish(e, topic, payload, metric.retained, metric.qos);
                    });
                    $("#select-modal")[0].showModal();
                });
                $("#select-modal button").click((event) => {
                    $("#select-modal p").not(':first').remove();
                });
                break;
            case 5: //image
                console.log("TODO: image");
                break;
            default:
                console.log("Unknown type");
                return;
        }
    },

    metricPublish: function (e, topic, payload, retained, qos) {
        $('.loader', e.currentTarget).show();
        this.publish(topic, payload, retained, qos);
    },

    publish: function (topic, payload, retained, qos) {
        this.mqtt.publish(topic, payload, qos, retained);
    },

    openUri: function (uri) {
        window.open(uri);
    },

    connect: function () {
        console.log("Connecting to " + this.settings.host + " " + this.settings.port );
        if (typeof this.mqtt === 'undefined' ) {
            this.mqtt = new Paho.Client(this.settings.host, this.settings.port, this.settings.clientid);
            this.mqtt.onConnected = this.onConnected.bind(this);
            this.mqtt.onConnectionLost = this.onConnectionLost.bind(this);
            this.mqtt.onMessageArrived = this.onMessageArrived.bind(this);
            this.connectOptions = {
                useSSL: this.settings.ssl,
                timeout: 3,
                userName: this.settings.username,
                password: this.settings.password,
                onSuccess: this.onSuccess,
                onFailure: this.onFailure,
                invocationContext: this,
                reconnect: true
            }
        }
        this.mqtt.connect(this.connectOptions);
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
        $('#connectBtn').off('click');
        $('#connectBtn').on('click', this.disconnect.bind(this));
        $("#connectBtn").prop("title", $('#connectBtn').attr('data-disconnect-str'));
        $("#connectBtn i").removeClass("mjd-icon-ic_connect").addClass("mjd-icon-ic_disconnect");
        this.createMetrics();
        this.timer = setInterval(this.updateMetricLast.bind(this), 500);
    },

    onConnectionLost: function (responseObject) {
        console.log("Connection to " + this.settings.host + " lost");
        if (responseObject.errorCode !== 0) {
            console.log(responseObject.errorMessage);
        }
        $('.loader').hide();
        $('#connectBtn').off('click');
        $('#connectBtn').on('click', this.connect.bind(this));
        $("#connectBtn").prop("title", $('#connectBtn').attr('data-connect-str'));
        $("#connectBtn i").removeClass("mjd-icon-ic_disconnect").addClass("mjd-icon-ic_connect");
        clearInterval(this.timer);
    },

    onMessageArrived: function (msg) {
        console.log(msg.destinationName);
        let binary = false;
        let bin_type = '';
        try {
            console.log(msg.payloadString);
        } catch(e) {
            binary = true;
            bin_type = this.file_type(msg.payloadBytes)
            console.log('data:' + bin_type + ';base64,...');
        }
        if (msg.destinationName == this.settings.exchangeTopic) {
            console.log("Exchanging metrics");
            this.mqtt.unsubscribe(this.settings.exchangeTopic);
            this.metrics = JSON.parse(msg.payloadString);
            storageSet('metrics', JSON.stringify(this.metrics));
            this.createMetrics();
        } else {
            this.metrics.forEach((metric, idx) => {
                if (metric.topic === msg.destinationName) {
                    $('#id_' + metric.id + ' .loader').hide();
                    this.metrics[idx].payload = !binary ? msg.payloadString : 'data:' + bin_type + ';base64,' + btoa(String.fromCharCode(...msg.payloadBytes));
                    this.metrics[idx].activity = Math.trunc(Date.now()/1000);
                    this.updateMetric(idx);
                }
            });
        }
    },

    file_type: function (data) {
      var arr = data.subarray(0, 4);
      var header = '';

      for(var i = 0; i < arr.length; i++) {
        header += arr[i].toString(16);
      }

      switch(true) {
        case /^89504e47/.test(header):
          return 'image/png';
        case /^47494638/.test(header):
          return 'image/gif';
        case /^424d/.test(header):
          return 'image/bmp';
        case /^ffd8ff/.test(header):
          return 'image/jpeg';
        default:
          return 'unknown';
      }
    }
}

$(document).ready(app.init());
