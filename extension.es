/*global
    MessageBotExtension
*/

var logviewer = MessageBotExtension('logviewer');

(function(ex) {
    'use strict';
    ex.tab = ex.ui.addTab('Logs');
    ex.tab.innerHTML = '<style>#logviewer{overflow-y: scroll; -webkit-overflow-scrolling: touch; /* iOS -.- */ height: 100%; padding: 0 10px;}#logviewer select{width: 100%; max-width: 20em;}#logviewer button{width: 5em; padding: 5px; border: 0; border-radius: 7px; color: #fff; background: #182b73;}</style><div id="logviewer"> <h3>Options</h3> <label>Display lines <input type="number" value="1000" data-config="showLines"/></label><br><label>Show date <input type="checkbox" data-config="date" checked/></label><br><label>Show time <input type="checkbox" data-config="time" checked/></label><br><h4>Choose a starting point</h4> <select data-search="line" disabled></select> <br><br><button data-search="line">Go</button> <br><h4>Or enter a date</h4> <input type="text" placeholder="Dec 1 2016" data-search="date"> <button data-search="date">Go</button> <hr> <pre id="logviewer_logs"></pre></div>';

    ex.tab.setAttribute('style', 'padding: 0; height: calc(100% - 80px);');
}(logviewer));

(function(ex) {
    'use strict';
    ex.setAutoLaunch(true);
    ex.uninstall = function() {
        ex.ui.removeTab(ex.tab);
    };

    var config = {
        showLines: 1000,
        showDate: true,
        showTime: true,
    };
    ex.tab.addEventListener('change', function() {
        config.showLines = +ex.tab.querySelector('[data-config="showLines"]').value;
        config.showDate = ex.tab.querySelector('[data-config="date"]').checked;
        config.showTime = ex.tab.querySelector('[data-config="time"]').checked;
    });


    ex.tab.querySelector('button[data-search="line"]').addEventListener('click', function() {
        showLogs(+ex.tab.querySelector('select').value);
    });

    ex.tab.querySelector('button[data-search="date"]').addEventListener('click', function() {
        var d = Date.parse(ex.tab.querySelector('input[data-search="date"]').value);
        if (isNaN(d)) {
            ex.ui.notify("Invalid date");
            return;
        }

        findLogLineByDate(d).then(showLogs);
    });

    //Build the quick jump list
    (function() {
        var template = '<option value="{line}">{text}</option>';
        var html = '<option value="0">Start</option>';
        //This could be cleaned up more.
        findLogLineByDate(Date.now() - 3600 * 1000)
        .then(line => {
            html += template.replace('{line}', line).replace('{text}', 'One hour ago');
            return findLogLineByDate(Date.now() - 86400 * 1000);
        })
        .then(line => {
            html += template.replace('{line}', line).replace('{text}', 'One day ago');
            return findLogLineByDate(Date.now() - 604800 * 1000);
        })
        .then(line => {
            html += template.replace('{line}', line).replace('{text}', 'One week ago');
            return findLogLineByDate(Date.now() - 2419200 * 1000);
        })
        .then(line => {
            html += template.replace('{line}', line).replace('{text}', 'One month ago');
        }).then(() => {
            ex.tab.querySelector('select[data-search="line"]').innerHTML = html;
            ex.tab.querySelector('select[data-search="line"]').disabled = false;
            showLogs(0);
        });
    }());

    function showLogs(start) {
        ex.api.getLogs()
            .then(lines => {
                var html = `Starting at line ${start}\n`;
                for (let i = 0; i < config.showLines && i + start < lines.length; i++) {
                    let line = lines[i + start];
                    if (line.length < 30) { //Short line that cannot be easily parsed, just add it.
                        html += line;
                        continue;
                    }
                    //Parse the line,
                    //2016-12-08 02:00:04.652 blockheads_server161p1[31274] Exiting World.
                    let time = new Date(Date.parse(line.substr(0, 23).replace(' ', 'T') + 'Z'));
                    let message = line.substr(line.indexOf(']') + 2);
                    if (config.showTime && time != 'Invalid Date') {
                        message = `${time.toLocaleTimeString()} ${message}`;
                    }
                    if (config.showDate && time != 'Invalid Date') {
                        message = `${time.toLocaleDateString()} ${message}`;
                    }

                    html += `${message}\n`;
                }
                return html;
            }).then(html => {
                ex.tab.querySelector('#logviewer_logs').textContent = html;
            });
    }

    function findLogLineByDate(timestamp) { //int
        //TODO: Refine this to use a binary search
        console.log("Searching for ", timestamp);
        return ex.api.getLogs()
            .then(lines => {
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (line.length < 30)  {
                        continue;
                    }

                    let time = Date.parse(line.substr(0, 23).replace(' ', 'T') + 'Z');
                    if (!isNaN(time) && time > timestamp) {
                        return i;
                    }
                }

                return 0;
            });
    }

}(logviewer));
