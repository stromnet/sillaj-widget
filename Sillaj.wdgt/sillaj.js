var flipper;

var conf = {'baseURL':'', 'username':'', 'password':'', 'round':1,
				'php_session_timeout':1440}; // the php_session_timeout var should be same as session.gc_maxlifetime in php.ini. Defaults to 1440 seconds

var loggedIn = null;
var lastProjectUpdate = null;
var cookie = "";
var submitting = false;

function log() {
	var str = "";
	for(var n=0; n < arguments.length; n++) {
		str+= arguments[n] + " ";
	}
	document.getElementById('log').value += str + "\n";
}

function doRequest(method, url, data, cb, noForceLogin)
{
	noForceLogin = !!noForceLogin;
	var xmlconn=new XMLHttpRequest();
	xmlconn.open(method, conf['baseURL']+"/"+url, true);
	xmlconn.setRequestHeader("Cookie", cookie);
	xmlconn.setRequestHeader('Accept', 'application/json');
	xmlconn.onreadystatechange=function()
		{
			if(xmlconn.readyState==4)
			{
				var r = xmlconn.responseText;
				log(method, url, JSON.stringify(data), ", Status: ", xmlconn.status, r);
				if(xmlconn.status == 401 && !noForceLogin) {
					login(true, function(){
						doRequest(method, url, data, cb, true);
					});
					return;
				}
				if(r.match(/error/))
				{
					var re = new RegExp(/<p class="error">(.*)<\/p>/);
					var m = re.exec(r);
					document.getElementById('status').innerHTML = "Error: ";
					if(m != null)
					{
						for(var i = 1; i<m.length; i++)
							document.getElementById('status').innerHTML+= m[i];
					}
					else
						document.getElementById('status').innerHTML+= "Parse";
				}else
				{
					document.getElementById('status').innerHTML="";
					// assume OK
					if(cb)
						cb(xmlconn);
				}
			}
		}

	var strData = null;
	if(data != null)
	{
		strData = "";
		for(var i in data)
			strData+=i+"="+escape(data[i])+"&"
	}

	xmlconn.send(strData);
}

function login(force, cb)
{
	if(force == false && (loggedIn != null && (new Date()).getTime()/1000 < loggedIn.getTime()/1000 + conf['php_session_timeout']))
	{
		if(cb)
			cb();
		return;
	}

	var data = {'strUserId':conf['username'], 'strPassword':conf['password']};
	doRequest("POST", "login_xmlhttp.php", data, function(c)
		{
			// assume OK
			loggedIn = new Date();
			cookie = c.getResponseHeader("Set-Cookie");
			if(cookie)
				cookie = cookie.substr(0, cookie.indexOf(';')); // hope that phpsess is first

			if(cb)
				cb();
		}
	);

}

function postEvent(data, cb, recursive)
{
	login(false, function()
		{
			doRequest("POST", "index.php", data, function(c)
				{
					var r=c.responseText;
					if(r.match(/login/))
					{
						// not logged in...
						if(recursive == true)
						{
							// Failed to post event due to login failure...
							document.getElementById('status').innerHTML+="Failed to post event!";
							submitting = false;
						}
						else
						{
							login(true, function(){
								postEvent(data, cb, true);	// try again
								});
						}
					}else
					{
						// assume OK
						if(cb)
							cb();
						submitting = false;
					}
				}
			);
		}
	);
}

function updateProjects()
{
	login(false, function(){
		var dom = document.getElementById('selProj');
		if(lastProjectUpdate != null &&
				(new Date()).getTime()/1000 < (lastProjectUpdate.getTime()/1000 + 86400) &&
				dom.hasChildNodes()
				) {
			log("Skipping updateProjects");
			return;
		}

		updateXmlArrayDropdownList("getProject_xmlhttp.php",
				dom,
				true,
				function(){
					lastProjectUpdate = new Date();
				});
		}
	);
}

function updateTasks()
{
	login(false, function(){
		var sp = document.getElementById('selProj');
		var projId = sp.options[sp.selectedIndex].value;

		if(projId == 0)
			return;

		updateXmlArrayDropdownList("getTask_xmlhttp.php?intProjectId="+projId, document.getElementById('selTask'), false);
		}
	);
}

function updateXmlArrayDropdownList (url, droplist, blank, cb)
{
	var lastSel;
	if(droplist.selectedIndex != -1){
		lastSel = droplist.options[droplist.selectedIndex].value;
	}

	doRequest("GET", url, null, function(c)
		{
			var result = JSON.parse(c.responseText);

			while(droplist.hasChildNodes())
				droplist.removeChild(droplist.childNodes[0]);

			var index =0;
			if(blank)
				droplist.options[index++] = new Option("", 0);

			var selectedIndex = -1;
			for(var k in result)
			{
				var k = parseInt(k, 10);
				var v = result[k];
				if(k == lastSel) {
					selectedIndex = index;
				}

				droplist.options[index++] = new Option(v,k);
			}

			droplist.selectedIndex = selectedIndex;

			if(cb)
				cb();
		}
	);
	
}

function refreshPage()
{
	updateProjects();

	/* Setup date selector */
	var sd = document.getElementById('selDate');
	var lastSel;
	if(sd.selectedIndex != -1)
		lastSel = sd.options[sd.selectedIndex].value;

	while(sd.hasChildNodes())
		sd.removeChild(sd.childNodes[0]);
	
	var index = 0;
	var newSel = 0;
	for(var i = 0; i < 5; i++)
	{
		var dd = new Date();
		dd.setDate(dd.getDate()-i);
		var m = ""+(dd.getMonth()+1);
		var d = ""+(dd.getDate());
		if(m.length == 1)m = "0"+m;
		if(d.length == 1)d = "0"+d;

		var n = dd.getFullYear() +"-"+ m +"-"+ d;

		sd.options[index++] = new Option(n,n);
		if(n == lastSel) 
			newSel = index-1;
	}

	if(lastSel != null && newSel != 0)
	{
		// Get date of lastSel and compare it to current. if more than 6 hours diff, ignore lastSel
		var dd = sd.options[lastSel].value;
		var d = Date.parse(d)
		if(d.getTime() + 3600*6*1000 < (new Date()).getTime())
			newSel = 0; // set current date
	}
	sd.selectedIndex = newSel;
}

function submitEvent()
{
	var data = {}
	if(submitting)
		return;

	if(	document.getElementById('selTask').selectedIndex == -1 ||
			document.getElementById('selProj').selectedIndex <= 0 
		)
	{
		document.getElementById('status').innerHTML="Project and task has to be selected.";
		return;
	}

	data['timStart'] = document.getElementById('txtStart').value;
	data['timEnd'] = document.getElementById('txtEnd').value;
	data['timDuration'] = document.getElementById('txtDur').value;
	data['strRem'] = document.getElementById('txtRem').value;
	data['intProjectId'] = document.getElementById('selProj').options[document.getElementById('selProj').selectedIndex].value;
	data['intTaskId'] = document.getElementById('selTask').options[document.getElementById('selTask').selectedIndex].value;
	data['datEvent'] = document.getElementById('selDate').options[document.getElementById('selDate').selectedIndex].value;

	if(data['timDuration'] == '' && (data['timStart'] == '' || data['timEnd'] == ''))
	{
		document.getElementById('status').innerHTML="You have to enter duration or start AND end time.";
		return;
	}

	submitting = true;

	// all ok? submit
	postEvent(data, function()
	{
		document.getElementById('status').innerHTML="Saved!";
		document.getElementById('txtStart').value = '';
		document.getElementById('txtEnd').value = '';
		document.getElementById('txtDur').value = '';
		document.getElementById('txtRem').value = '';
		setTimeout(function() {document.getElementById('status').innerHTML='';}, 5000);  // clear saved label
//		document.getElementById('submitButton').disabled = false;
	});
}

function resizeMe() {
	window.resizeTo(508, 341);
}

function getCurrentTime()
{
	var d = new Date(); 
	var h = d.getHours().toString(); 
	if (h.length == 1)
		h = "0" + h; 

	var m = d.getMinutes().toString(); 
	m = ""+(Math.round(m / conf.round) * conf.round);
	if (m.length == 1)
		m = "0" + m; 

	return h + ":" + m; 
}

function setStartTime()
{
	var d = new Date();
	document.getElementById('txtStart').value = getCurrentTime();
}

function setEndTime()
{
	var d = new Date();
	document.getElementById('txtEnd').value = getCurrentTime();
}

function setup() {
	flipper = new Fader(document.getElementById('flip'), null, 500);
	createGenericButton (document.getElementById('saveButton'), 'Done', showFront, 67);
	createGenericButton (document.getElementById('startButton'), 'Now',setStartTime, 67);
	createGenericButton (document.getElementById('endButton'), 'Now', setEndTime, 67);
	createGenericButton (document.getElementById('submitButton'), 'Save', submitEvent, 67);

	window.widget.onhide = onHide;
	window.widget.onshow = onShow;

	// load conf
	for(var k in conf)
	{
		var v = widget.preferenceForKey(k);
		if(v == null)
			continue;
		conf[k] = v;
	}

	if(conf['baseURL'] == '' ||
		conf['username'] == '' ||
		conf['password'] == '')
		showBackside(null);

	var sp = document.getElementById('selProj');
	sp.onchange = updateTasks;
	
//	loadPage();
	resizeMe();
	refreshPage();

	setTimeout("resizeMe()", 1000);
	log("Hi there, sillaj widghet here");
	return 0;
}


function onHide () {
	log("sillaj onHide");
}

function onShow() {
	log("sillaj onShow");
	refreshPage();
//	loadPage();
}

function showBackside(event) {
	if (window.widget) {
		document.getElementById("txtBaseURL").value=conf['baseURL'];
		document.getElementById("txtUsername").value=conf['username'];
		document.getElementById("txtPassword").value=conf['password'];
		document.getElementById("selRound").value=conf['round'];
		window.widget.prepareForTransition("ToBack");
		document.getElementById("fliprollie").style.display="none";
		document.getElementById("front").style.display="none";
		document.getElementById("back").style.display="block";
		resizeMe();
		setTimeout("window.widget.performTransition()", 0);
	}
}	

function showFront(event) {
	if (window.widget) {
		conf['baseURL'] = document.getElementById("txtBaseURL").value;
		conf['username'] = document.getElementById("txtUsername").value;
		conf['password'] = document.getElementById("txtPassword").value;
		conf['round'] = document.getElementById("selRound").value; 

		for(var k in conf)
			widget.setPreferenceForKey(conf[k], k);

		window.widget.prepareForTransition("ToFront");
		document.getElementById("front").style.display="block";
		document.getElementById("back").style.display="none";
		//		loadPage();
		refreshPage();
		setTimeout("window.widget.performTransition()", 0);
	}
}
