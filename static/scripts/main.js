"use strict";

let currClass = [];
let classes = [];

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
			console.log("decoded");
			convertFile(result);
		});
	}
	fr.readAsArrayBuffer(file);
        
}

function convertFile(result){
    let freqDataQueue = [];
    let columnTruncateLength = 232;
    let sampleRate = 44100;
    
	console.log(result);
	
    let oac = new OfflineAudioContext({
        numberOfChannels: result.numberOfChannels,
        length: result.length,
        sampleRate: sampleRate,
    });
    const source = oac.createBufferSource();
    const processor = oac.createScriptProcessor(1024, 1, 1);

    const analyser = oac.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;

    source.buffer = result;

    source.connect(analyser);
    analyser.connect(processor);
    processor.connect(oac.destination);

    var freqData = new Float32Array(analyser.fftSize);
    processor.onaudioprocess = () => {
        analyser.getFloatFrequencyData(freqData);
        freqDataQueue.push(freqData.slice(0, columnTruncateLength));
    };

    source.start(0);
    oac.startRendering();

    oac.oncomplete = (e) => {
        //console.log(freqDataQueue);
        source.disconnect(analyser);
        processor.disconnect(oac.destination);
		currClass.push({
			frequencyFrames : freqDataQueue,
			blob : null,
			startTime : 0,
			endTime : 1,
			recordingDuration : 1,
			blobFilePath : "",
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
	classes[className] = currClass;
    let div = document.getElementById("files");
	div.innerHTML = "";
	let classDiv = document.getElementById("classes");
	classDiv.innerHTML += className;
	classDiv.innerHTML += "<br>";
	currClass = [];
})

document.getElementById("saveAll").addEventListener("click", async function(){
	if (classes["Background Noise"] == undefined){
		return;
	}
	let mainZip = new JSZip();
	let promises = [];
	fetch("sample.webm").then((result) => {
		let dummyFile = result.body;
		mainZip.file("manifest.json", `{"type":"audio","version":"2.4.7","appdata":{"publishResults":{},"trainEpochs":50,"trainBatchSize":-1,"trainLearningRate":-1}}`);
		for (const className in classes){
			let jsonText = JSON.stringify(classes[className]);
			let classZip = new JSZip();
			classZip.file("samples-1.webm", dummyFile);
			classZip.file("samples.json", jsonText);
			let promise = classZip.generateAsync({type:"blob",compression: "STORE"});
			promises.push(promise);
			promise.then((blob) => {
				console.log(className+"zipped");
				console.log(blob);
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
document.getElementById("clear").addEventListener("click",function(){
    let div = document.getElementById("files");
	div.innerHTML = "";
	let classDiv = document.getElementById("classes");
	classDiv.innerHTML = "";
	currClass = [];
	classes = [];
})

