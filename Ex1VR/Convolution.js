import * as THREE from 'https://cdn.skypack.dev/three@0.136.0/build/three.module.js';

const vecshdr = `uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
precision highp float;
in vec3 position;
void main() {
    gl_Position = projectionMatrix *
                  modelViewMatrix * vec4(position, 1.0 );
}`;

const gaussFS = `
precision highp float;
uniform sampler2D image;
out vec4 out_FragColor;
uniform float gaussianKernel[999];
uniform float xpos;
uniform float ypos;
uniform sampler2D deptharr;
int sizeDiv2;

int counter = 0;
float total = 0.0;

#define PI          3.14

void main(void) {
    vec4 textureValue = vec4 ( 0,0,0,0 );
    //sizeDiv2 = int(floor(float(kernelsize/2)));
    //sizeDiv2 = gaussianSize;

    float pntF = texelFetch(deptharr,ivec2(1920.*xpos, 1080.*ypos), 0).r;
    float curF = texelFetch(deptharr,ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y)), 0).r;
    float diff = abs(curF - pntF);//>0.5?0.5:abs(curF - pntF);

    float size = 50.*diff;
    if(size == 0.) size = 2.;
    float sigma = 3.;

    float gk[200];
    //float a = -1. / (PI * pow(sigma, 4.));
    float coeff = 1. / (2. * PI * sigma * sigma);
//size = 10.;
    float sum = 0.;
    float bound = floor(size / 2.);
    float rowlen = floor(size / 2.) * 2. + 1.;
    for (float x = -bound; x <= bound; x++)
        for (float y = -bound; y <= bound; y++)
        {
            float pwr = -float(x * x + y * y) / float(2. * sigma * sigma);
            float val = coeff * exp(pwr);
            gk[int((x + bound) * rowlen + (y + bound))] = val;
            textureValue += texelFetch(image, ivec2(int(x)+int(gl_FragCoord.x), int(y)+int(gl_FragCoord.y)), 0 ) * val;
            counter++;
            sum += val;
        }
/*
    for (int i = 0; i < int(size * size); i++)
        gk[i] /= sum;


        sizeDiv2 = int(bound);
    for (int i=-sizeDiv2;i<=sizeDiv2;i++)
        for (int j=-sizeDiv2;j<=sizeDiv2;j++)
        {
            textureValue += texelFetch(image, ivec2(j+int(gl_FragCoord.x), i+int(gl_FragCoord.y)), 0 ) * float(gk[counter]);
            counter++;
            //total += float(gk[counter]);
        }
        */
    textureValue /= sum;

    out_FragColor = vec4(textureValue.rgb, 1.0);
    //out_FragColor = vec4(vec3(diff), 1.0);
    //out_FragColor = vec4(texelFetch(deptharr,ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y)), 0).rgb, 1.0);
    //out_FragColor = vec4(texelFetch(image,ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y)), 0).rgb, 1.0);
}
`;

function IVimageProcessing ( height, width, imageProcessingMaterial, canvas, context, parent )
{
		this.height = height;
		this.width = width;
        this.parent = parent;
		
        //3 rtt setup
        this.scene = new THREE.Scene();
        this.orthoCamera = new THREE.OrthographicCamera(-1,1,1,-1,1/Math.pow( 2, 53 ),1 );

        //4 create a target texture
        var options = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type:THREE.FloatType,
//            type:THREE.UnsignedByteType,
            canvas: canvas, 
            context: context
        };
        this.rtt = new THREE.WebGLRenderTarget( width, height, options);

        var geom = new THREE.BufferGeometry();
        geom.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array([-1,-1,0, 1,-1,0, 1,1,0, -1,-1, 0, 1, 1, 0, -1,1,0 ]), 3 ) );
        this.scene.add( new THREE.Mesh( geom, imageProcessingMaterial ) );

        //this.uniforms = uniforms;
}



export function imgproc(texture, zarr, height, width, canvas, context, renderer){

var mats = [];
const size = width * height;
const zdata = new Uint8Array( 4 * size );
const color = new THREE.Color( 0xffffff );

const r = Math.floor( color.r * 255 );
const g = Math.floor( color.g * 255 );
const b = Math.floor( color.b * 255 );

for ( let i = 0; i < size; i ++ ) {

	const stride = i * 4;

	zdata[ stride ] = zarr[i];
	zdata[ stride + 1 ] = zarr[i];
	zdata[ stride + 2 ] = zarr[i];
	zdata[ stride + 3 ] = 255;

}
const datatexture = new THREE.DataTexture( zdata, width, height );
datatexture.needsUpdate = true;
var gausMat = new THREE.RawShaderMaterial({
    uniforms: {
        image: {type: 't', value: texture},
        xpos: {type: 'f', value: 0.5},
        ypos: {type: 'f', value: 0.5},
        gaussianKernel: {value: gausKernelGen(2,1)},
        deptharr:{type: 't', value: datatexture}
    },
    defines:{
        kernelsize: 1,
    },
    vertexShader: vecshdr,
    fragmentShader: gaussFS,
    glslVersion: THREE.GLSL3
});

var gausIP = new IVimageProcessing (height, width, gausMat, canvas, context, null );

renderer.setRenderTarget( gausIP.rtt );
renderer.render ( gausIP.scene, gausIP.orthoCamera ); 	
renderer.setRenderTarget( null );
mats.push(gausIP);

return mats;

}

export function gausKernelGen(size, sigma)
{
    var coeff = 1/(2*Math.PI*sigma*sigma);
    var arr = [];
    var sum = 0;
    var bound = Math.floor(size/2);
    var rowlen = Math.floor(size/2)*2 +1;
    for(var x = -bound; x<=bound;x++)
        for(var y = -bound; y<=bound;y++)
        {
            var pwr = -((x*x+y*y)/(2*sigma*sigma));
            var val = coeff*Math.exp(pwr);
            arr[(x+bound)*rowlen + (y+bound)] = val;
            sum += val;
        }
    
    //for(var i =0; i<arr.length; i++)
    //    arr[i] /=sum;
    return arr;
}

export function lpKernelGen(size, sigma)
{
    var a = -1/(Math.PI*Math.pow(sigma,4));
    //var coeff = 1/(2*Math.PI*sigma*sigma);
    var arr = [];
    var sum = 0;
    var bound = Math.floor(size/2);
    var rowlen = Math.floor(size/2)*2 +1;
    for(var x = -bound; x<=bound;x++)
        for(var y = -bound; y<=bound;y++)
        {
            var b = 1 - (x*x+y*y)/(2*sigma*sigma);
            var pwr = -((x*x+y*y)/(2*sigma*sigma));
            var val = a*b*Math.exp(pwr);
            arr[(x+bound)*rowlen + (y+bound)] = val;
            sum += val;
        }
    
    //for(var i =0; i<arr.length; i++)
    //    arr[i] /=sum;
    return arr;
}