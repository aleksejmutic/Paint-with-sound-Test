import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';

let scene, camera, renderer, analyser, dataArray;
let settings, uniformsColor, audioCtx;
let planes = [];

async function init() {
    const container = document.getElementById('container');

    // THREE.js setup
    scene = new THREE.Scene();
    // Orthographic camera with -width/2 to width/2 so positions match pixels
    camera = new THREE.OrthographicCamera(-window.innerWidth/2, window.innerWidth/2, window.innerHeight/2, -window.innerHeight/2, 0.1, 10);
    camera.position.z = 1;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Audio setup
    audioCtx = new AudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.fftSize);
    source.connect(analyser);

    document.body.addEventListener('click', async () => {
        if (audioCtx.state === 'suspended') await audioCtx.resume();
    });

    // Shared color uniform
    uniformsColor = {
        u_color: { value: new THREE.Color(0x00ffff) },
        u_amp: { value: 0.0 },
        u_time: { value: 0.0 }
    };

    // Shader definitions
    const shaderConfigs = [
        { // Top-left: Vibrating circles
            fragmentShader: `
                uniform float u_time;
                uniform float u_amp;
                uniform vec3 u_color;
                varying vec2 vUv;
                void main() {
                    vec2 center = vUv - 0.5;
                    float radius1 = 0.1 + 0.05*sin(u_time*5.0)*u_amp;
                    float radius2 = 0.2 + 0.07*sin(u_time*3.0 + 1.0)*u_amp;
                    float dist = length(center);
                    float circle = step(dist, radius1) + step(dist, radius2);
                    gl_FragColor = vec4(u_color * circle,1.0);
                }
            `
        },
        { // Top-right: Wave
            fragmentShader: `
                uniform float u_time;
                uniform float u_amp;
                uniform vec3 u_color;
                varying vec2 vUv;
                void main() {
                    float wave = sin(vUv.x*20.0 + u_time*5.0) * u_amp;
                    vec3 color = u_color * (0.5 + wave);
                    gl_FragColor = vec4(color,1.0);
                }
            `
        },
        { // Bottom-left: Flashing lights
            fragmentShader: `
                uniform float u_time;
                uniform float u_amp;
                uniform vec3 u_color;
                varying vec2 vUv;
                void main() {
                    float flash = step(0.5, fract(u_time*5.0 + vUv.x*5.0)) * u_amp;
                    gl_FragColor = vec4(u_color * flash, 1.0);
                }
            `
        },
        { // Bottom-right: Radial pulse
            fragmentShader: `
                uniform float u_time;
                uniform float u_amp;
                uniform vec3 u_color;
                varying vec2 vUv;
                void main() {
                    vec2 center = vUv - 0.5;
                    float dist = length(center);
                    float pulse = 0.5 + 0.5*sin(20.0*dist - u_time*5.0)*u_amp;
                    gl_FragColor = vec4(u_color * pulse,1.0);
                }
            `
        }
    ];

    // Create planes for each quadrant
    shaderConfigs.forEach((cfg, i) => {
        const material = new THREE.ShaderMaterial({
            uniforms: uniformsColor,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
                }
            `,
            fragmentShader: cfg.fragmentShader
        });

        const geometry = new THREE.PlaneGeometry(window.innerWidth/2, window.innerHeight/2);
        const mesh = new THREE.Mesh(geometry, material);

        // Position planes: top-left, top-right, bottom-left, bottom-right
        mesh.position.x = (i%2 === 0 ? -window.innerWidth/4 : window.innerWidth/4);
        mesh.position.y = (i<2 ? window.innerHeight/4 : -window.innerHeight/4);

        planes.push(mesh);
        scene.add(mesh);
    });

    setupGUI();
    window.addEventListener('resize', onResize);
    animate();
}

function setupGUI() {
    settings = { color: '#00ffff', sensitivity: 5.0 };
    const gui = new GUI();
    gui.addColor(settings,'color').name('Color').onChange(val => uniformsColor.u_color.value.set(val));
    gui.add(settings,'sensitivity',0.1,20.0).step(0.1).name('Sensitivity');
}

function onResize() {
    camera.left = -window.innerWidth/2;
    camera.right = window.innerWidth/2;
    camera.top = window.innerHeight/2;
    camera.bottom = -window.innerHeight/2;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    planes.forEach((plane, i) => {
        plane.geometry = new THREE.PlaneGeometry(window.innerWidth/2, window.innerHeight/2);
        plane.position.x = (i%2 === 0 ? -window.innerWidth/4 : window.innerWidth/4);
        plane.position.y = (i<2 ? window.innerHeight/4 : -window.innerHeight/4);
    });
}

function animate(time) {
    requestAnimationFrame(animate);

    analyser.getByteTimeDomainData(dataArray);
    let avg = dataArray.reduce((a,b)=>a+Math.abs(b-128),0)/dataArray.length;
    uniformsColor.u_amp.value = (avg/128) * settings.sensitivity;
    uniformsColor.u_time.value = time*0.001;

    renderer.render(scene,camera);
}

init();
