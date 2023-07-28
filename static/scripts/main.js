"use strict";

let currClass = [];
let classes = [];
let identFuncId = 0;
let recognizer = undefined;
let serialPort = undefined;

function storageAvailable(type) {
	let storage;
	try {
	  storage = window[type];
	  const x = "__storage_test__";
	  storage.setItem(x, x);
	  storage.removeItem(x);
	  return true;
	} catch (e) {
	  return (
		e instanceof DOMException &&
		// everything except Firefox
		(e.code === 22 ||
		  // Firefox
		  e.code === 1014 ||
		  // test name field too, because code might not be present
		  // everything except Firefox
		  e.name === "QuotaExceededError" ||
		  // Firefox
		  e.name === "NS_ERROR_DOM_QUOTA_REACHED") &&
		// acknowledge QuotaExceededError only if there's something already stored
		storage &&
		storage.length !== 0
	  );
	}
  }

function selectFile(contentType, multiple){
    return new Promise(resolve => {
        let input = document.createElement('input');
        input.type = 'file';
        input.multiple = multiple;
        input.accept = contentType;

        input.onchange = () => {
            let files = Array.from(input.files);
            if (multiple)
                resolve(files);
            else
                resolve(files[0]);
        };

        input.click();
    });
}

function processFile(file){
	let div = document.getElementById("files");
    let c = new AudioContext({
        sampleRate: 44100,
    });
    
	div.innerHTML += file.name
	div.innerHTML += "<br>"
	
	let fr = new FileReader();
	fr.onload = () => {
		c.decodeAudioData(fr.result).then((result)=>{
			//console.log("decoded");
			convertFile(result);
		});
	}
	fr.readAsArrayBuffer(file);
        
}

function processFileForIdent(blob,then){
    let c = new AudioContext({
        sampleRate: 44100,
    });
	blob.arrayBuffer().then((arr) => {
		c.decodeAudioData(arr).then((result)=>{
			//console.log("decoded instant file");
			convertFileForIdent(result,then);
		});
	});
	
}

function convertFileForIdent(result,then){
	let freqDataQueue = [];
    let columnTruncateLength = 232;
    let sampleRate = 44100;
	
    let oac = new OfflineAudioContext({
        numberOfChannels: result.numberOfChannels,
        length: result.length,
        sampleRate: sampleRate,
    });

    const source = oac.createBufferSource();
    const processor = oac.createScriptProcessor(1024, 1, 1);

    const analyser = oac.createAnalyser();
    analyser.fftSize = 1024;  //2048
    analyser.smoothingTimeConstant = 0;

    source.buffer = result;

    source.connect(analyser);
    analyser.connect(processor);
    processor.connect(oac.destination);

    var freqData = new Float32Array(analyser.fftSize);
    processor.onaudioprocess = () => {
        analyser.getFloatFrequencyData(freqData);
        freqDataQueue.push(Array.from(freqData.slice(0, columnTruncateLength)));
    };

    source.start(0);
    oac.startRendering();

    oac.oncomplete = (e) => {
		source.disconnect(analyser);
        processor.disconnect(oac.destination);
		then(freqDataQueue.slice(0,43));
    };
}

function convertFile(result){
    let freqDataQueue = [];
    let columnTruncateLength = 232;
    let sampleRate = 44100;
    
	//console.log(result);
	
    let oac = new OfflineAudioContext({
        numberOfChannels: result.numberOfChannels,
        length: result.length,
        sampleRate: sampleRate,
    });
    const source = oac.createBufferSource();
    const processor = oac.createScriptProcessor(1024, 1, 1);

    const analyser = oac.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;

    source.buffer = result;

    source.connect(analyser);
    analyser.connect(processor);
    processor.connect(oac.destination);

    var freqData = new Float32Array(analyser.fftSize);
    processor.onaudioprocess = () => {
        analyser.getFloatFrequencyData(freqData);
        freqDataQueue.push(Array.from(freqData.slice(0, columnTruncateLength)));
    };

    source.start(0);
    oac.startRendering();

    oac.oncomplete = (e) => {
        //console.log(freqDataQueue);
        source.disconnect(analyser);
        processor.disconnect(oac.destination);
		currClass.push({
			frequencyFrames : freqDataQueue.slice(0,43),
			blob : null,
			startTime : 0,
			endTime : 1.0375,
			recordingDuration : 4.15,
			blobFilePath : "sample-1.webm",
		})
    };
}

document.getElementById("select").addEventListener("click",async function(){
	let filesP = selectFile("audio/wav",true);
	filesP.then((files) => {
		for (const file of files) {
			processFile(file);
		}
	})
})

document.getElementById("addToClass").addEventListener("click",function(){
	let className = document.getElementById('className').value;
	if (className == ""){
		alert("Class name must not be empty.");
		return;
	}
	classes[className] = currClass;
    let div = document.getElementById("files");
	div.innerHTML = "";
	let classDiv = document.getElementById("classes");
	classDiv.innerHTML += className;
	classDiv.innerHTML += "<br>";
	currClass = [];
})

document.getElementById("saveAll").addEventListener("click", async function(){
	if (classes["_background_noise_"] == undefined){
		alert("A class named _background_noise_ is required.")
		return;
	}
	let mainZip = new JSZip();
	let promises = [];
	fetch("sample.webm").then(async (result) => {
		let dummyFile = await result.blob();
		mainZip.file("manifest.json", `{"type":"audio","version":"2.4.7","appdata":{"publishResults":{},"trainEpochs":50,"trainBatchSize":-1,"trainLearningRate":-1}}`);
		for (const className in classes){
			let jsonText = JSON.stringify(classes[className]);
			let classZip = new JSZip();
			classZip.file("sample-1.webm", dummyFile);
			classZip.file("samples.json", jsonText);
			let promise = classZip.generateAsync({type:"blob",compression: "STORE"});
			promises.push(promise);
			promise.then((blob) => {
				//console.log(className+"zipped");
				//console.log(blob);
				mainZip.file(className+"-!-0.zip",blob);
			});
		}
		Promise.allSettled(promises).then(()=> {
			mainZip.generateAsync({type:"blob",compression: "STORE"}).then((blob) => {
				saveAs(blob, "project.tm");
			});
		});
	});
});

let contIdent = false;

function ident(){
	init();
}

document.getElementById("enableIdent").addEventListener("click", async function(){
	recognizer = await createModel();
	contIdent = true;
	ident();
	//
    //identFuncId =setInterval(ident,500);
})

document.getElementById("disableIdent").addEventListener("click",function(){
	contIdent = false;
    //clearInterval(identFuncId);
})

document.getElementById("connect").addEventListener("click",function(){
	navigator.serial.requestPort().then((port) => {
		// Connect to `port` or add it to the list of available ports.
		port.open({baudRate: 115200}).then(()=>{
			serialPort = port;
			let status = document.getElementById("connect-status");
			status.innerHTML = "Connected"
		});
	})
	.catch((e) => {
		alert("No port was selected.")
	});
});


document.getElementById("disconnect").addEventListener("click",function(){
	if (serialPort != undefined){
		serialPort.close();
		let status = document.getElementById("connect-status");
		status.innerHTML = "Disconnected"
	}
});


window.addEventListener('load', function () {
	if (storageAvailable("localStorage")){
		if (localStorage.getItem("modelURL")) {
			document.getElementById('modelURL').value = localStorage.getItem("modelURL");
		}
	}
});

function sendResult(className){
	if (serialPort != undefined){
		if (serialPort.writable != null){
			className += "$";
			const encoder = new TextEncoder();
			const writer = serialPort.writable.getWriter();
			writer.write(encoder.encode(className)).then(() => {
				writer.releaseLock();
			});
		}
	}
}

// more documentation available at
// https://github.com/tensorflow/tfjs-models/tree/master/speech-commands

// the link to your model provided by Teachable Machine export panel
//const URL = "https://teachablemachine.withgoogle.com/models/Qp_lXOBSb/"; // on/off
//const URL = "https://teachablemachine.withgoogle.com/models/GU7qKNLsH/";

async function createModel() {
	let URL = document.getElementById('modelURL').value;
	if (storageAvailable("localStorage")){
		window.localStorage.setItem("modelURL", URL);
	}
	const checkpointURL = URL + "model.json"; // model topology
	const metadataURL = URL + "metadata.json"; // model metadata

	const recognizer = speechCommands.create(
		"BROWSER_FFT", // fourier transform type, not useful to change
		undefined, // speech commands vocabulary feature, not useful for your models
		checkpointURL,
		metadataURL);

	// check that model and metadata are loaded via HTTPS requests.
	await recognizer.ensureModelLoaded();

	return recognizer;
}

async function init() {
	const classLabels = recognizer.wordLabels(); // get class labels
	const labelContainer = document.getElementById("label-container");
	for (let i = 0; i < classLabels.length; i++) {
		labelContainer.appendChild(document.createElement("div"));
	}
	fetch("http://127.0.0.1:5000/file.wav").then( async (file) => {
		let fileBlob = await file.blob();
		processFileForIdent(fileBlob,async (mySpectrogramData) => {
			const x = tf.tensor(mySpectrogramData).reshape([-1, ...recognizer.modelInputShape().slice(1)]);
			//const x = tf.tensor4d(mySpectrogramData, [1].concat(recognizer.modelInputShape().slice(1)));
			const result = await recognizer.recognize(x);
			console.log(recognizer.params().fftSize);
			//console.log(result);
			// render the probability scores per class
			let maxClass = "";
			let maxScore = 0;
			for (let i = 0; i < classLabels.length; i++) {
				const classPrediction = classLabels[i] + ": " + result.scores[i].toFixed(2);
				labelContainer.childNodes[i].innerHTML = classPrediction;
				if (result.scores[i] > maxScore){
					maxClass = classLabels[i];
					maxScore = result.scores[i];
				}
			}
			tf.dispose([x, result]);
			let status = document.getElementById("live-status");
			status.innerHTML = "Result updated"
			sendResult(maxClass);
			if (contIdent){
				setTimeout(init,500);
			}
		});
	})
	.catch(() => {
		let status = document.getElementById("live-status");
		status.innerHTML = "Error fetching live file."
		if (contIdent){
			init();
		}
	});
}