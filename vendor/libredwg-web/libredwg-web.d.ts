// TypeScript bindings for emscripten-generated code.  Automatically generated at compile time.
declare var RuntimeExports: {
    FS: {
        root: null;
        mounts: never[];
        devices: {};
        streams: never[];
        nextInode: number;
        nameTable: never[];
        currentPath: string;
        initialized: boolean;
        ignorePermissions: boolean;
        syncFSRequests: number;
        ErrnoError: {
            new (errno: any): {
                name: string;
                errno: any;
            };
        };
        FSStream: {
            new (): {
                shared: {};
                get object(): any;
                set object(val: any);
                node: any;
                get isRead(): boolean;
                get isWrite(): boolean;
                get isAppend(): number;
                flags: any;
                position: any;
            };
        };
        FSNode: {
            new (parent: any, name: any, mode: any, rdev: any): {
                node_ops: {};
                stream_ops: {};
                readMode: number;
                writeMode: number;
                mounted: null;
                parent: any;
                mount: any;
                id: number;
                name: any;
                mode: any;
                rdev: any;
                atime: number;
                mtime: number;
                ctime: number;
                get read(): boolean;
                set read(val: boolean);
                get write(): boolean;
                set write(val: boolean);
                readonly isFolder: any;
                readonly isDevice: any;
                addListener(cb: any, exclusive?: boolean): {
                    listeners: any;
                    entry: {
                        cb: any;
                        exclusive: boolean;
                    };
                };
                notifyListeners(flags: any): void;
                exclTurn: any;
            };
        };
        lookupPath(path: any, opts?: {}): {
            path: string;
            node?: undefined;
        } | {
            path: string;
            node: any;
        };
        getPath(node: any): any;
        hashName(parentid: any, name: any): number;
        hashAddNode(node: any): void;
        hashRemoveNode(node: any): void;
        lookupNode(parent: any, name: any): any;
        createNode(parent: any, name: any, mode: any, rdev?: undefined): any;
        destroyNode(node: any): void;
        isRoot(node: any): boolean;
        isMountpoint(node: any): boolean;
        isFile(mode: any): boolean;
        isDir(mode: any): boolean;
        isLink(mode: any): boolean;
        isChrdev(mode: any): boolean;
        isBlkdev(mode: any): boolean;
        isFIFO(mode: any): boolean;
        isSocket(mode: any): boolean;
        flagsToPermissionString(flag: any): string;
        nodePermissions(node: any, perms: any): 0 | 2;
        mayLookup(dir: any): any;
        mayCreate(dir: any, name: any): any;
        mayDelete(dir: any, name: any, isdir: any): any;
        mayOpen(node: any, flags: any): any;
        checkOpExists(op: any, err: any): any;
        MAX_OPEN_FDS: number;
        nextfd(): number;
        getStreamChecked(fd: any): any;
        getStream: (fd: any) => any;
        createStream(stream: any, fd?: number): any;
        closeStream(fd: any): void;
        dupStream(origStream: any, fd?: number): any;
        doSetAttr(stream: any, node: any, attr: any): void;
        chrdev_stream_ops: {
            open(stream: any): void;
            llseek(): never;
        };
        major: (dev: any) => number;
        minor: (dev: any) => number;
        makedev: (ma: any, mi: any) => number;
        registerDevice(dev: any, ops: any): void;
        getDevice: (dev: any) => any;
        getMounts(mount: any): any[];
        syncfs(populate: any, callback: any): void;
        mount(type: any, opts: any, mountpoint: any): any;
        unmount(mountpoint: any): void;
        lookup(parent: any, name: any): any;
        mknod(path: any, mode: any, dev: any): any;
        statfs(path: any): any;
        statfsStream(stream: any): any;
        statfsNode(node: any): {
            bsize: number;
            frsize: number;
            blocks: number;
            bfree: number;
            bavail: number;
            files: any;
            ffree: number;
            fsid: number;
            flags: number;
            namelen: number;
        };
        create(path: any, mode?: number): any;
        mkdir(path: any, mode?: number): any;
        mkdirTree(path: any, mode?: number): void;
        mkdev(path: any, mode: any, dev?: undefined): any;
        symlink(oldpath: any, newpath: any): any;
        link(oldpath: any, newpath: any, flags: any): any;
        rename(old_path: any, new_path: any): void;
        rmdir(path: any): void;
        readdir(path: any): any;
        unlink(path: any): void;
        readlink(path: any): any;
        stat(path: any, dontFollow?: boolean): any;
        fstat(fd: any): any;
        lstat(path: any): any;
        doChmod(stream: any, node: any, mode: any, dontFollow?: boolean): void;
        chmod(path: any, mode: any, dontFollow?: boolean): void;
        lchmod(path: any, mode: any): void;
        fchmod(fd: any, mode: any): void;
        doChown(stream: any, node: any, dontFollow?: boolean): void;
        chown(path: any, uid: any, gid: any, dontFollow?: boolean): void;
        lchown(path: any, uid: any, gid: any): void;
        fchown(fd: any, uid: any, gid: any): void;
        doTruncate(stream: any, node: any, len: any): void;
        truncate(path: any, len: any): void;
        ftruncate(fd: any, len: any): void;
        utime(path: any, atime: any, mtime: any, dontFollow?: boolean): void;
        open(path: any, flags: any, mode?: number): any;
        close(stream: any): void;
        isClosed(stream: any): boolean;
        llseek(stream: any, offset: any, whence: any): any;
        read(stream: any, buffer: any, offset: any, length: any, position?: undefined): any;
        write(stream: any, buffer: any, offset: any, length: any, position?: undefined, canOwn?: undefined): any;
        mmap(stream: any, length: any, position: any, prot: any, flags: any): any;
        msync(stream: any, buffer: any, offset: any, length: any, mmapFlags: any): any;
        ioctl(stream: any, cmd: any, arg: any): any;
        readFile(path: any, opts?: {}): Uint8Array<any>;
        writeFile(path: any, data: any, opts?: {}): void;
        cwd: () => any;
        chdir(path: any): void;
        createDefaultDirectories(): void;
        createDefaultDevices(): void;
        createSpecialDirectories(): void;
        createStandardStreams(input: any, output: any, error: any): void;
        staticInit(): void;
        init(input?: undefined, output?: undefined, error?: undefined): void;
        quit(): void;
        analyzePath(path: any, dontResolveLastLink?: boolean): {
            isRoot: boolean;
            exists: boolean;
            error: number;
            name: null;
            path: null;
            object: null;
            parentExists: boolean;
            parentPath: null;
            parentObject: null;
        };
        createPath(parent: any, path: any, canRead?: undefined, canWrite?: undefined): any;
        createFile(parent: any, name: any, properties: any, canRead?: undefined, canWrite?: undefined): any;
        createDataFile(parent: any, name: any, data?: undefined, canRead?: undefined, canWrite?: undefined, canOwn?: undefined): void;
        createDevice(parent: any, name: any, input?: undefined, output?: undefined): any;
        forceLoadFile(obj: any): true | undefined;
        createLazyFile(parent: any, name: any, url: any, canRead?: undefined, canWrite?: undefined): any;
    };
    ENV: {};
    /**
     * @param {string|null=} returnType
     * @param {Array=} argTypes
     * @param {Array=} args
     * @param {Object=} opts
     */
    ccall: (ident: any, returnType?: (string | null) | undefined, argTypes?: any[] | undefined, args?: any[] | undefined, opts?: Object | undefined) => any;
    /**
     * @param {string=} returnType
     * @param {Array=} argTypes
     * @param {Object=} opts
     */
    cwrap: (ident: any, returnType?: string | undefined, argTypes?: any[] | undefined, opts?: Object | undefined) => any;
    /**
     * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
     * emscripten HEAP, returns a copy of that string as a Javascript String object.
     *
     * @param {number} ptr
     * @param {number=} maxBytesToRead - An optional length that specifies the
     *   maximum number of bytes to read. You can omit this parameter to scan the
     *   string until the first 0 byte. If maxBytesToRead is passed, and the string
     *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
     *   string will cut short at that byte index.
     * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
     * @return {string}
     */
    UTF8ToString: (ptr: number, maxBytesToRead?: number | undefined, ignoreNul?: boolean | undefined) => string;
    stringToNewUTF8: (str: any) => any;
    /**
     * @param {number} ptr
     * @param {number} value
     * @param {string} type
     */
    setValue: (ptr: number, value: number, type?: string) => void;
};
interface WasmModule {
  __Znwm(_0: number): number;
  __ZdlPvm(_0: number, _1: number): void;
  _strndup(_0: number, _1: number): number;
  __ZdaPv(_0: number): void;
  __ZdaPvm(_0: number, _1: number): void;
  __ZdlPv(_0: number): void;
  _emscripten_builtin_malloc(_0: number): number;
  __Znam(_0: number): number;
  __ZnamSt11align_val_t(_0: number, _1: number): number;
  __ZnwmSt11align_val_t(_0: number, _1: number): number;
  ___libc_calloc(_0: number, _1: number): number;
  ___libc_free(_0: number): void;
  ___libc_malloc(_0: number): number;
  ___libc_realloc(_0: number, _1: number): number;
  _emscripten_builtin_calloc(_0: number, _1: number): number;
  _emscripten_builtin_free(_0: number): void;
  _emscripten_builtin_realloc(_0: number, _1: number): number;
  _malloc_size(_0: number): number;
  _malloc_usable_size(_0: number): number;
  _reallocf(_0: number, _1: number): number;
}

type EmbindString = ArrayBuffer|Uint8Array|Uint8ClampedArray|Int8Array|string;
export interface ClassHandle {
  isAliasOf(other: ClassHandle): boolean;
  delete(): void;
  deleteLater(): this;
  isDeleted(): boolean;
  // @ts-ignore - If targeting lower than ESNext, this symbol might not exist.
  [Symbol.dispose](): void;
  clone(): this;
}
export interface Dwg_Version_TypeValue<T extends number> {
  value: T;
}
export type Dwg_Version_Type = Dwg_Version_TypeValue<0>|Dwg_Version_TypeValue<1>|Dwg_Version_TypeValue<2>|Dwg_Version_TypeValue<3>|Dwg_Version_TypeValue<4>|Dwg_Version_TypeValue<5>|Dwg_Version_TypeValue<6>|Dwg_Version_TypeValue<7>|Dwg_Version_TypeValue<8>|Dwg_Version_TypeValue<9>|Dwg_Version_TypeValue<10>|Dwg_Version_TypeValue<11>|Dwg_Version_TypeValue<12>|Dwg_Version_TypeValue<13>|Dwg_Version_TypeValue<14>|Dwg_Version_TypeValue<15>|Dwg_Version_TypeValue<16>|Dwg_Version_TypeValue<17>|Dwg_Version_TypeValue<18>|Dwg_Version_TypeValue<18>|Dwg_Version_TypeValue<19>|Dwg_Version_TypeValue<20>|Dwg_Version_TypeValue<21>|Dwg_Version_TypeValue<22>|Dwg_Version_TypeValue<23>|Dwg_Version_TypeValue<24>|Dwg_Version_TypeValue<25>|Dwg_Version_TypeValue<26>|Dwg_Version_TypeValue<27>|Dwg_Version_TypeValue<28>|Dwg_Version_TypeValue<29>|Dwg_Version_TypeValue<30>|Dwg_Version_TypeValue<31>|Dwg_Version_TypeValue<32>|Dwg_Version_TypeValue<33>|Dwg_Version_TypeValue<34>|Dwg_Version_TypeValue<35>|Dwg_Version_TypeValue<36>|Dwg_Version_TypeValue<37>|Dwg_Version_TypeValue<38>|Dwg_Version_TypeValue<39>|Dwg_Version_TypeValue<40>|Dwg_Version_TypeValue<41>|Dwg_Version_TypeValue<42>;

export interface Dwg_Class_StabilityValue<T extends number> {
  value: T;
}
export type Dwg_Class_Stability = Dwg_Class_StabilityValue<0>|Dwg_Class_StabilityValue<1>|Dwg_Class_StabilityValue<2>|Dwg_Class_StabilityValue<3>;

export interface Dwg_Entity_SectionsValue<T extends number> {
  value: T;
}
export type Dwg_Entity_Sections = Dwg_Entity_SectionsValue<0>|Dwg_Entity_SectionsValue<64>|Dwg_Entity_SectionsValue<128>;

export interface Dwg_Object_SupertypeValue<T extends number> {
  value: T;
}
export type Dwg_Object_Supertype = Dwg_Object_SupertypeValue<0>|Dwg_Object_SupertypeValue<1>;

export interface Dwg_Object_TypeValue<T extends number> {
  value: T;
}
export type Dwg_Object_Type = Dwg_Object_TypeValue<0>|Dwg_Object_TypeValue<1>|Dwg_Object_TypeValue<2>|Dwg_Object_TypeValue<3>|Dwg_Object_TypeValue<4>|Dwg_Object_TypeValue<5>|Dwg_Object_TypeValue<6>|Dwg_Object_TypeValue<7>|Dwg_Object_TypeValue<8>|Dwg_Object_TypeValue<10>|Dwg_Object_TypeValue<11>|Dwg_Object_TypeValue<12>|Dwg_Object_TypeValue<13>|Dwg_Object_TypeValue<14>|Dwg_Object_TypeValue<15>|Dwg_Object_TypeValue<16>|Dwg_Object_TypeValue<17>|Dwg_Object_TypeValue<18>|Dwg_Object_TypeValue<19>|Dwg_Object_TypeValue<20>|Dwg_Object_TypeValue<21>|Dwg_Object_TypeValue<22>|Dwg_Object_TypeValue<23>|Dwg_Object_TypeValue<24>|Dwg_Object_TypeValue<25>|Dwg_Object_TypeValue<26>|Dwg_Object_TypeValue<27>|Dwg_Object_TypeValue<28>|Dwg_Object_TypeValue<29>|Dwg_Object_TypeValue<30>|Dwg_Object_TypeValue<31>|Dwg_Object_TypeValue<32>|Dwg_Object_TypeValue<33>|Dwg_Object_TypeValue<34>|Dwg_Object_TypeValue<35>|Dwg_Object_TypeValue<36>|Dwg_Object_TypeValue<37>|Dwg_Object_TypeValue<38>|Dwg_Object_TypeValue<39>|Dwg_Object_TypeValue<40>|Dwg_Object_TypeValue<41>|Dwg_Object_TypeValue<42>|Dwg_Object_TypeValue<43>|Dwg_Object_TypeValue<44>|Dwg_Object_TypeValue<45>|Dwg_Object_TypeValue<46>|Dwg_Object_TypeValue<47>|Dwg_Object_TypeValue<48>|Dwg_Object_TypeValue<49>|Dwg_Object_TypeValue<50>|Dwg_Object_TypeValue<51>|Dwg_Object_TypeValue<52>|Dwg_Object_TypeValue<53>|Dwg_Object_TypeValue<56>|Dwg_Object_TypeValue<57>|Dwg_Object_TypeValue<60>|Dwg_Object_TypeValue<61>|Dwg_Object_TypeValue<62>|Dwg_Object_TypeValue<63>|Dwg_Object_TypeValue<64>|Dwg_Object_TypeValue<65>|Dwg_Object_TypeValue<66>|Dwg_Object_TypeValue<67>|Dwg_Object_TypeValue<68>|Dwg_Object_TypeValue<69>|Dwg_Object_TypeValue<72>|Dwg_Object_TypeValue<73>|Dwg_Object_TypeValue<74>|Dwg_Object_TypeValue<75>|Dwg_Object_TypeValue<76>|Dwg_Object_TypeValue<77>|Dwg_Object_TypeValue<78>|Dwg_Object_TypeValue<79>|Dwg_Object_TypeValue<80>|Dwg_Object_TypeValue<81>|Dwg_Object_TypeValue<82>|Dwg_Object_TypeValue<498>|Dwg_Object_TypeValue<499>;

export interface Dwg_Object_Type_r11Value<T extends number> {
  value: T;
}
export type Dwg_Object_Type_r11 = Dwg_Object_Type_r11Value<0>|Dwg_Object_Type_r11Value<1>|Dwg_Object_Type_r11Value<2>|Dwg_Object_Type_r11Value<3>|Dwg_Object_Type_r11Value<4>|Dwg_Object_Type_r11Value<5>|Dwg_Object_Type_r11Value<6>|Dwg_Object_Type_r11Value<7>|Dwg_Object_Type_r11Value<8>|Dwg_Object_Type_r11Value<9>|Dwg_Object_Type_r11Value<10>|Dwg_Object_Type_r11Value<11>|Dwg_Object_Type_r11Value<12>|Dwg_Object_Type_r11Value<13>|Dwg_Object_Type_r11Value<14>|Dwg_Object_Type_r11Value<15>|Dwg_Object_Type_r11Value<16>|Dwg_Object_Type_r11Value<17>|Dwg_Object_Type_r11Value<18>|Dwg_Object_Type_r11Value<19>|Dwg_Object_Type_r11Value<20>|Dwg_Object_Type_r11Value<21>|Dwg_Object_Type_r11Value<22>|Dwg_Object_Type_r11Value<23>|Dwg_Object_Type_r11Value<24>|Dwg_Object_Type_r11Value<25>;

export interface Dwg_ErrorValue<T extends number> {
  value: T;
}
export type Dwg_Error = Dwg_ErrorValue<0>|Dwg_ErrorValue<1>|Dwg_ErrorValue<2>|Dwg_ErrorValue<4>|Dwg_ErrorValue<8>|Dwg_ErrorValue<16>|Dwg_ErrorValue<32>|Dwg_ErrorValue<64>|Dwg_ErrorValue<128>|Dwg_ErrorValue<256>|Dwg_ErrorValue<512>|Dwg_ErrorValue<1024>|Dwg_ErrorValue<2048>|Dwg_ErrorValue<4096>|Dwg_ErrorValue<8192>;

export interface Dwg_Hdl_CodeValue<T extends number> {
  value: T;
}
export type Dwg_Hdl_Code = Dwg_Hdl_CodeValue<0>|Dwg_Hdl_CodeValue<2>|Dwg_Hdl_CodeValue<3>|Dwg_Hdl_CodeValue<4>|Dwg_Hdl_CodeValue<5>;

export interface DWG_SECTION_TYPEValue<T extends number> {
  value: T;
}
export type DWG_SECTION_TYPE = DWG_SECTION_TYPEValue<0>|DWG_SECTION_TYPEValue<1>|DWG_SECTION_TYPEValue<2>|DWG_SECTION_TYPEValue<3>|DWG_SECTION_TYPEValue<4>|DWG_SECTION_TYPEValue<0>|DWG_SECTION_TYPEValue<1>|DWG_SECTION_TYPEValue<2>|DWG_SECTION_TYPEValue<3>|DWG_SECTION_TYPEValue<4>|DWG_SECTION_TYPEValue<10>|DWG_SECTION_TYPEValue<11>|DWG_SECTION_TYPEValue<12>|DWG_SECTION_TYPEValue<13>|DWG_SECTION_TYPEValue<14>|DWG_SECTION_TYPEValue<15>|DWG_SECTION_TYPEValue<16>|DWG_SECTION_TYPEValue<17>|DWG_SECTION_TYPEValue<18>|DWG_SECTION_TYPEValue<19>;

export interface RESBUF_VALUE_TYPEValue<T extends number> {
  value: T;
}
export type RESBUF_VALUE_TYPE = RESBUF_VALUE_TYPEValue<0>|RESBUF_VALUE_TYPEValue<1>|RESBUF_VALUE_TYPEValue<2>|RESBUF_VALUE_TYPEValue<3>|RESBUF_VALUE_TYPEValue<0>|RESBUF_VALUE_TYPEValue<1>|RESBUF_VALUE_TYPEValue<2>|RESBUF_VALUE_TYPEValue<3>|RESBUF_VALUE_TYPEValue<0>|RESBUF_VALUE_TYPEValue<1>|RESBUF_VALUE_TYPEValue<2>|RESBUF_VALUE_TYPEValue<3>;

export interface dwg_point_3d extends ClassHandle {
  x: number;
  y: number;
  z: number;
}

export interface dwg_point_2d extends ClassHandle {
  x: number;
  y: number;
}

interface EmbindModule {
  Dwg_Version_Type: {R_INVALID: Dwg_Version_TypeValue<0>, R_1_1: Dwg_Version_TypeValue<1>, R_1_2: Dwg_Version_TypeValue<2>, R_1_3: Dwg_Version_TypeValue<3>, R_1_4: Dwg_Version_TypeValue<4>, R_2_0b: Dwg_Version_TypeValue<5>, R_2_0: Dwg_Version_TypeValue<6>, R_2_10: Dwg_Version_TypeValue<7>, R_2_21: Dwg_Version_TypeValue<8>, R_2_22: Dwg_Version_TypeValue<9>, R_2_4: Dwg_Version_TypeValue<10>, R_2_5: Dwg_Version_TypeValue<11>, R_2_6: Dwg_Version_TypeValue<12>, R_9: Dwg_Version_TypeValue<13>, R_9c1: Dwg_Version_TypeValue<14>, R_10: Dwg_Version_TypeValue<15>, R_11b1: Dwg_Version_TypeValue<16>, R_11b2: Dwg_Version_TypeValue<17>, R_11: Dwg_Version_TypeValue<18>, R_12: Dwg_Version_TypeValue<18>, R_13b1: Dwg_Version_TypeValue<19>, R_13b2: Dwg_Version_TypeValue<20>, R_13: Dwg_Version_TypeValue<21>, R_13c3: Dwg_Version_TypeValue<22>, R_14: Dwg_Version_TypeValue<23>, R_2000b: Dwg_Version_TypeValue<24>, R_2000: Dwg_Version_TypeValue<25>, R_2000i: Dwg_Version_TypeValue<26>, R_2002: Dwg_Version_TypeValue<27>, R_2004a: Dwg_Version_TypeValue<28>, R_2004b: Dwg_Version_TypeValue<29>, R_2004c: Dwg_Version_TypeValue<30>, R_2004: Dwg_Version_TypeValue<31>, R_2007a: Dwg_Version_TypeValue<32>, R_2007b: Dwg_Version_TypeValue<33>, R_2007: Dwg_Version_TypeValue<34>, R_2010b: Dwg_Version_TypeValue<35>, R_2010: Dwg_Version_TypeValue<36>, R_2013b: Dwg_Version_TypeValue<37>, R_2013: Dwg_Version_TypeValue<38>, R_2018b: Dwg_Version_TypeValue<39>, R_2018: Dwg_Version_TypeValue<40>, R_2022b: Dwg_Version_TypeValue<41>, R_AFTER: Dwg_Version_TypeValue<42>};
  Dwg_Class_Stability: {STABLE: Dwg_Class_StabilityValue<0>, UNSTABLE: Dwg_Class_StabilityValue<1>, DEBUGGING: Dwg_Class_StabilityValue<2>, UNHANDLED: Dwg_Class_StabilityValue<3>};
  Dwg_Entity_Sections: {ENTITY_SECTION: Dwg_Entity_SectionsValue<0>, BLOCKS_SECTION: Dwg_Entity_SectionsValue<64>, EXTRA_SECTION: Dwg_Entity_SectionsValue<128>};
  Dwg_Object_Supertype: {SUPERTYPE_ENTITY: Dwg_Object_SupertypeValue<0>, SUPERTYPE_OBJECT: Dwg_Object_SupertypeValue<1>};
  Dwg_Object_Type: {TYPE_UNUSED: Dwg_Object_TypeValue<0>, TYPE_TEXT: Dwg_Object_TypeValue<1>, TYPE_ATTRIB: Dwg_Object_TypeValue<2>, TYPE_ATTDEF: Dwg_Object_TypeValue<3>, TYPE_BLOCK: Dwg_Object_TypeValue<4>, TYPE_ENDBLK: Dwg_Object_TypeValue<5>, TYPE_SEQEND: Dwg_Object_TypeValue<6>, TYPE_INSERT: Dwg_Object_TypeValue<7>, TYPE_MINSERT: Dwg_Object_TypeValue<8>, TYPE_VERTEX_2D: Dwg_Object_TypeValue<10>, TYPE_VERTEX_3D: Dwg_Object_TypeValue<11>, TYPE_VERTEX_MESH: Dwg_Object_TypeValue<12>, TYPE_VERTEX_PFACE: Dwg_Object_TypeValue<13>, TYPE_VERTEX_PFACE_FACE: Dwg_Object_TypeValue<14>, TYPE_POLYLINE_2D: Dwg_Object_TypeValue<15>, TYPE_POLYLINE_3D: Dwg_Object_TypeValue<16>, TYPE_ARC: Dwg_Object_TypeValue<17>, TYPE_CIRCLE: Dwg_Object_TypeValue<18>, TYPE_LINE: Dwg_Object_TypeValue<19>, TYPE_DIMENSION_ORDINATE: Dwg_Object_TypeValue<20>, TYPE_DIMENSION_LINEAR: Dwg_Object_TypeValue<21>, TYPE_DIMENSION_ALIGNED: Dwg_Object_TypeValue<22>, TYPE_DIMENSION_ANG3PT: Dwg_Object_TypeValue<23>, TYPE_DIMENSION_ANG2LN: Dwg_Object_TypeValue<24>, TYPE_DIMENSION_RADIUS: Dwg_Object_TypeValue<25>, TYPE_DIMENSION_DIAMETER: Dwg_Object_TypeValue<26>, TYPE_POINT: Dwg_Object_TypeValue<27>, TYPE_3DFACE: Dwg_Object_TypeValue<28>, TYPE_POLYLINE_PFACE: Dwg_Object_TypeValue<29>, TYPE_POLYLINE_MESH: Dwg_Object_TypeValue<30>, TYPE_SOLID: Dwg_Object_TypeValue<31>, TYPE_TRACE: Dwg_Object_TypeValue<32>, TYPE_SHAPE: Dwg_Object_TypeValue<33>, TYPE_VIEWPORT: Dwg_Object_TypeValue<34>, TYPE_ELLIPSE: Dwg_Object_TypeValue<35>, TYPE_SPLINE: Dwg_Object_TypeValue<36>, TYPE_REGION: Dwg_Object_TypeValue<37>, TYPE_3DSOLID: Dwg_Object_TypeValue<38>, TYPE_BODY: Dwg_Object_TypeValue<39>, TYPE_RAY: Dwg_Object_TypeValue<40>, TYPE_XLINE: Dwg_Object_TypeValue<41>, TYPE_DICTIONARY: Dwg_Object_TypeValue<42>, TYPE_OLEFRAME: Dwg_Object_TypeValue<43>, TYPE_MTEXT: Dwg_Object_TypeValue<44>, TYPE_LEADER: Dwg_Object_TypeValue<45>, TYPE_TOLERANCE: Dwg_Object_TypeValue<46>, TYPE_MLINE: Dwg_Object_TypeValue<47>, TYPE_BLOCK_CONTROL: Dwg_Object_TypeValue<48>, TYPE_BLOCK_HEADER: Dwg_Object_TypeValue<49>, TYPE_LAYER_CONTROL: Dwg_Object_TypeValue<50>, TYPE_LAYER: Dwg_Object_TypeValue<51>, TYPE_STYLE_CONTROL: Dwg_Object_TypeValue<52>, TYPE_STYLE: Dwg_Object_TypeValue<53>, TYPE_LTYPE_CONTROL: Dwg_Object_TypeValue<56>, TYPE_LTYPE: Dwg_Object_TypeValue<57>, TYPE_VIEW_CONTROL: Dwg_Object_TypeValue<60>, TYPE_VIEW: Dwg_Object_TypeValue<61>, TYPE_UCS_CONTROL: Dwg_Object_TypeValue<62>, TYPE_UCS: Dwg_Object_TypeValue<63>, TYPE_VPORT_CONTROL: Dwg_Object_TypeValue<64>, TYPE_VPORT: Dwg_Object_TypeValue<65>, TYPE_APPID_CONTROL: Dwg_Object_TypeValue<66>, TYPE_APPID: Dwg_Object_TypeValue<67>, TYPE_DIMSTYLE_CONTROL: Dwg_Object_TypeValue<68>, TYPE_DIMSTYLE: Dwg_Object_TypeValue<69>, TYPE_GROUP: Dwg_Object_TypeValue<72>, TYPE_MLINESTYLE: Dwg_Object_TypeValue<73>, TYPE_OLE2FRAME: Dwg_Object_TypeValue<74>, TYPE_DUMMY: Dwg_Object_TypeValue<75>, TYPE_LONG_TRANSACTION: Dwg_Object_TypeValue<76>, TYPE_LWPOLYLINE: Dwg_Object_TypeValue<77>, TYPE_HATCH: Dwg_Object_TypeValue<78>, TYPE_XRECORD: Dwg_Object_TypeValue<79>, TYPE_PLACEHOLDER: Dwg_Object_TypeValue<80>, TYPE_VBA_PROJECT: Dwg_Object_TypeValue<81>, TYPE_LAYOUT: Dwg_Object_TypeValue<82>, TYPE_PROXY_ENTITY: Dwg_Object_TypeValue<498>, TYPE_PROXY_OBJECT: Dwg_Object_TypeValue<499>};
  Dwg_Object_Type_r11: {DWG_TYPE_UNUSED_r11: Dwg_Object_Type_r11Value<0>, DWG_TYPE_LINE_r11: Dwg_Object_Type_r11Value<1>, DWG_TYPE_POINT_r11: Dwg_Object_Type_r11Value<2>, DWG_TYPE_CIRCLE_r11: Dwg_Object_Type_r11Value<3>, DWG_TYPE_SHAPE_r11: Dwg_Object_Type_r11Value<4>, DWG_TYPE_REPEAT_r11: Dwg_Object_Type_r11Value<5>, DWG_TYPE_ENDREP_r11: Dwg_Object_Type_r11Value<6>, DWG_TYPE_TEXT_r11: Dwg_Object_Type_r11Value<7>, DWG_TYPE_ARC_r11: Dwg_Object_Type_r11Value<8>, DWG_TYPE_TRACE_r11: Dwg_Object_Type_r11Value<9>, DWG_TYPE_LOAD_r11: Dwg_Object_Type_r11Value<10>, DWG_TYPE_SOLID_r11: Dwg_Object_Type_r11Value<11>, DWG_TYPE_BLOCK_r11: Dwg_Object_Type_r11Value<12>, DWG_TYPE_ENDBLK_r11: Dwg_Object_Type_r11Value<13>, DWG_TYPE_INSERT_r11: Dwg_Object_Type_r11Value<14>, DWG_TYPE_ATTDEF_r11: Dwg_Object_Type_r11Value<15>, DWG_TYPE_ATTRIB_r11: Dwg_Object_Type_r11Value<16>, DWG_TYPE_SEQEND_r11: Dwg_Object_Type_r11Value<17>, DWG_TYPE_JUMP_r11: Dwg_Object_Type_r11Value<18>, DWG_TYPE_POLYLINE_r11: Dwg_Object_Type_r11Value<19>, DWG_TYPE_VERTEX_r11: Dwg_Object_Type_r11Value<20>, DWG_TYPE_3DLINE_r11: Dwg_Object_Type_r11Value<21>, DWG_TYPE_3DFACE_r11: Dwg_Object_Type_r11Value<22>, DWG_TYPE_DIMENSION_r11: Dwg_Object_Type_r11Value<23>, DWG_TYPE_VIEWPORT_r11: Dwg_Object_Type_r11Value<24>, DWG_TYPE_UNKNOWN_r11: Dwg_Object_Type_r11Value<25>};
  Dwg_Error: {DWG_NOERR: Dwg_ErrorValue<0>, DWG_ERR_WRONGCRC: Dwg_ErrorValue<1>, DWG_ERR_NOTYETSUPPORTED: Dwg_ErrorValue<2>, DWG_ERR_UNHANDLEDCLASS: Dwg_ErrorValue<4>, DWG_ERR_INVALIDTYPE: Dwg_ErrorValue<8>, DWG_ERR_INVALIDHANDLE: Dwg_ErrorValue<16>, DWG_ERR_INVALIDEED: Dwg_ErrorValue<32>, DWG_ERR_VALUEOUTOFBOUNDS: Dwg_ErrorValue<64>, DWG_ERR_CLASSESNOTFOUND: Dwg_ErrorValue<128>, DWG_ERR_SECTIONNOTFOUND: Dwg_ErrorValue<256>, DWG_ERR_PAGENOTFOUND: Dwg_ErrorValue<512>, DWG_ERR_INTERNALERROR: Dwg_ErrorValue<1024>, DWG_ERR_INVALIDDWG: Dwg_ErrorValue<2048>, DWG_ERR_IOERROR: Dwg_ErrorValue<4096>, DWG_ERR_OUTOFMEM: Dwg_ErrorValue<8192>};
  Dwg_Hdl_Code: {DWG_HDL_OWNER: Dwg_Hdl_CodeValue<0>, DWG_HDL_SOFTOWN: Dwg_Hdl_CodeValue<2>, DWG_HDL_HARDOWN: Dwg_Hdl_CodeValue<3>, DWG_HDL_SOFTPTR: Dwg_Hdl_CodeValue<4>, DWG_HDL_HARDPTR: Dwg_Hdl_CodeValue<5>};
  DWG_SECTION_TYPE: {SECTION_UNKNOWN: DWG_SECTION_TYPEValue<0>, SECTION_HEADER: DWG_SECTION_TYPEValue<1>, SECTION_AUXHEADER: DWG_SECTION_TYPEValue<2>, SECTION_CLASSES: DWG_SECTION_TYPEValue<3>, SECTION_HANDLES: DWG_SECTION_TYPEValue<4>, SECTION_TEMPLATE: DWG_SECTION_TYPEValue<0>, SECTION_OBJFREESPACE: DWG_SECTION_TYPEValue<1>, SECTION_OBJECTS: DWG_SECTION_TYPEValue<2>, SECTION_REVHISTORY: DWG_SECTION_TYPEValue<3>, SECTION_SUMMARYINFO: DWG_SECTION_TYPEValue<4>, SECTION_PREVIEW: DWG_SECTION_TYPEValue<10>, SECTION_APPINFO: DWG_SECTION_TYPEValue<11>, SECTION_APPINFOHISTORY: DWG_SECTION_TYPEValue<12>, SECTION_FILEDEPLIST: DWG_SECTION_TYPEValue<13>, SECTION_SECURITY: DWG_SECTION_TYPEValue<14>, SECTION_VBAPROJECT: DWG_SECTION_TYPEValue<15>, SECTION_SIGNATURE: DWG_SECTION_TYPEValue<16>, SECTION_ACDS: DWG_SECTION_TYPEValue<17>, SECTION_INFO: DWG_SECTION_TYPEValue<18>, SECTION_INFO: DWG_SECTION_TYPEValue<19>};
  RESBUF_VALUE_TYPE: {DWG_VT_INVALID: RESBUF_VALUE_TYPEValue<0>, DWG_VT_STRING: RESBUF_VALUE_TYPEValue<1>, DWG_VT_POINT3D: RESBUF_VALUE_TYPEValue<2>, DWG_VT_REAL: RESBUF_VALUE_TYPEValue<3>, DWG_VT_INT16: RESBUF_VALUE_TYPEValue<0>, DWG_VT_INT32: RESBUF_VALUE_TYPEValue<1>, DWG_VT_INT8: RESBUF_VALUE_TYPEValue<2>, DWG_VT_BINARY: RESBUF_VALUE_TYPEValue<3>, DWG_VT_HANDLE: RESBUF_VALUE_TYPEValue<0>, DWG_VT_OBJECTID: RESBUF_VALUE_TYPEValue<1>, DWG_VT_BOOL: RESBUF_VALUE_TYPEValue<2>, DWG_VT_INT64: RESBUF_VALUE_TYPEValue<3>};
  dwg_point_3d: {};
  dwg_point_2d: {};
  dwg_resbuf_value_type(_0: number): RESBUF_VALUE_TYPE;
  dwg_errstrings(_0: number): void;
  dwg_rgb_palette_index(_0: number): number;
  dwg_find_color_index(_0: number): number;
  dwg_object_get_tio(_0: number): number;
  dwg_object_get_type(_0: number): number;
  dwg_object_get_supertype(_0: number): number;
  dwg_object_get_fixedtype(_0: number): number;
  dwg_object_get_handle(_0: number): number;
  dwg_obj_obj_to_object(_0: number): number;
  dwg_obj_generic_to_object(_0: number): number;
  dwg_object_to_object(_0: number): number;
  dwg_object_to_object_tio(_0: number): number;
  dwg_object_to_entity(_0: number): number;
  dwg_object_to_entity_tio(_0: number): number;
  dwg_object_object_get_tio(_0: number): number;
  dwg_object_object_get_objid(_0: number): number;
  dwg_object_object_get_ownerhandle(_0: number): number;
  dwg_object_object_get_handle(_0: number): number;
  dwg_object_object_get_num_reactors(_0: number): number;
  dwg_object_object_get_reactors(_0: number): number;
  dwg_object_entity_get_ownerhandle(_0: number): number;
  dwg_object_entity_get_xdicobjhandle(_0: number): number;
  dwg_object_entity_get_handle(_0: number): number;
  dwg_object_entity_get_line_weight(_0: number): number;
  dwg_object_entity_get_entmode(_0: number): number;
  dwg_object_entity_get_invisible(_0: number): number;
  dwg_object_entity_get_plotstyle_flags(_0: number): number;
  dwg_object_entity_get_material_flags(_0: number): number;
  dwg_object_entity_get_shadow_flags(_0: number): number;
  dwg_object_entity_has_full_visualstyle(_0: number): number;
  dwg_object_entity_has_face_visualstyle(_0: number): number;
  dwg_object_entity_has_edge_visualstyle(_0: number): number;
  dwg_object_entity_get_num_reactors(_0: number): number;
  dwg_object_entity_get_reactors(_0: number): number;
  dwg_ref_get_absref(_0: number): number;
  dwg_ref_get_object(_0: number): number;
  dwg_ref_get_handle(_0: number): number;
  dwg_ref_object(_0: number, _1: number): number;
  dwg_ref_object_relative(_0: number, _1: number, _2: number): number;
  dwg_ref_object_silent(_0: number, _1: number): number;
  dwg_resolve_handleref(_0: number, _1: number): number;
  dwg_entity_owner(_0: number): number;
  dwg_get_version_type(_0: number): number;
  dwg_get_codepage(_0: number): number;
  dwg_get_num_classes(_0: number): number;
  dwg_block_control(_0: number): number;
  dwg_model_space_ref(_0: number): number;
  dwg_paper_space_ref(_0: number): number;
  dwg_model_space_object(_0: number): number;
  dwg_paper_space_object(_0: number): number;
  dwg_get_layer_count(_0: number): number;
  dwg_get_layer_index(_0: number, _1: number): number;
  dwg_get_num_objects(_0: number): number;
  dwg_get_object_num_objects(_0: number): number;
  dwg_class_is_entity(_0: number): number;
  dwg_obj_is_control(_0: number): number;
  dwg_obj_is_table(_0: number): number;
  dwg_obj_is_subentity(_0: number): number;
  dwg_obj_has_subentity(_0: number): number;
  dwg_obj_is_3dsolid(_0: number): number;
  dwg_obj_is_acsh(_0: number): number;
  dwg_get_num_entities(_0: number): number;
  dwg_get_entity_index(_0: number, _1: number): number;
  dwg_get_entity_layer(_0: number): number;
  dwg_next_object(_0: number): number;
  dwg_next_entity(_0: number): number;
  get_first_owned_entity(_0: number): number;
  get_next_owned_entity(_0: number, _1: number): number;
  get_first_owned_subentity(_0: number): number;
  get_next_owned_subentity(_0: number, _1: number): number;
  get_first_owned_block(_0: number): number;
  get_last_owned_block(_0: number): number;
  get_next_owned_block(_0: number, _1: number): number;
  get_next_owned_block_entity(_0: number, _1: number): number;
  dwg_get_first_object(_0: number, _1: Dwg_Object_Type): number;
  dwg_get_next_object(_0: number, _1: Dwg_Object_Type, _2: number): number;
  dwg_resolve_jump(_0: number): number;
  dwg_free(_0: number): void;
  dwg_abandon(_0: number): void;
  dwg_free_object(_0: number): void;
  dwg_new_ref(_0: number): number;
  dwg_dup_handleref(_0: number, _1: number): number;
  dwg_supports_eed(_0: number): number;
  dwg_supports_obj(_0: number, _1: number): number;
  dwg_add_object(_0: number): number;
  dwg_get_object(_0: number, _1: number): number;
  dwg_absref_get_object(_0: number, _1: number): number;
  dwg_resolve_handle(_0: number, _1: bigint): number;
  dwg_resolve_handle_silent(_0: number, _1: bigint): number;
  dwg_next_handle(_0: number): bigint;
  dwg_next_handseed(_0: number): bigint;
  dwg_add_handle(_0: number, _1: number, _2: bigint, _3: number): number;
  dwg_add_handleref(_0: number, _1: number, _2: bigint, _3: number): number;
  dwg_add_handleref_free(_0: number, _1: bigint): number;
  dwg_obj_get_handle_value(_0: number): bigint;
  dwg_ref_get_handle_value(_0: number): bigint;
  dwg_ref_get_handle_absolute_ref(_0: number): bigint;
  dwg_object_entity_get_ltype_flags(_0: number): number;
  dwg_object_entity_get_ltype_scale(_0: number): number;
  dwg_model_x_min(_0: number): number;
  dwg_model_x_max(_0: number): number;
  dwg_model_y_min(_0: number): number;
  dwg_model_y_max(_0: number): number;
  dwg_model_z_min(_0: number): number;
  dwg_model_z_max(_0: number): number;
  dwg_page_x_min(_0: number): number;
  dwg_page_x_max(_0: number): number;
  dwg_page_y_min(_0: number): number;
  dwg_page_y_max(_0: number): number;
  dwg_object_get_dxfname(_0: number): string;
  is_dwg_entity(_0: EmbindString): boolean;
  is_dwg_object(_0: EmbindString): boolean;
  dwg_dynapi_header_set_value(_0: number, _1: EmbindString, _2: number, _3: boolean): boolean;
  dwg_dynapi_entity_set_value(_0: number, _1: EmbindString, _2: EmbindString, _3: number, _4: boolean): boolean;
  dwg_dynapi_common_set_value(_0: number, _1: EmbindString, _2: number, _3: boolean): boolean;
  dwg_dynapi_handle_name(_0: number, _1: number, _2: number): string;
  dwg_dynapi_subclass_size(_0: EmbindString): number;
  dwg_dynapi_entity_field_offset(_0: number, _1: EmbindString): number;
  dwg_dynapi_subclass_field_offset(_0: EmbindString, _1: EmbindString): number;
  dwg_write_dxf(_0: EmbindString, _1: EmbindString): number;
  dwg_find_tablehandle(_0: number, _1: EmbindString, _2: EmbindString): number;
  dwg_find_tablehandle_index(_0: number, _1: number, _2: EmbindString): number;
  dwg_handle_name(_0: number, _1: EmbindString, _2: number): string;
  dwg_find_table_control(_0: number, _1: EmbindString): number;
  dwg_find_dictionary(_0: number, _1: EmbindString): number;
  dwg_find_dicthandle(_0: number, _1: number, _2: EmbindString): number;
  dwg_find_dicthandle_objname(_0: number, _1: number, _2: EmbindString): number;
  dwg_find_table_extname(_0: number, _1: number): string;
  dwg_variable_dict(_0: number, _1: EmbindString): string;
  dwg_section_type(_0: EmbindString): DWG_SECTION_TYPE;
  dwg_section_name(_0: number, _1: number): string;
  dwg_version_type(_0: Dwg_Version_Type): string;
  dwg_version_as(_0: EmbindString): Dwg_Version_Type;
  dwg_version_hdr_type(_0: EmbindString): Dwg_Version_Type;
  dwg_encrypt_SAT1(_0: number, _1: number, _2: number): string;
  dwg_object_name(_0: EmbindString, _1: number, _2: number, _3: number, _4: number): number;
  dwg_obj_layer_get_name(_0: number): string;
  dwg_obj_layer_set_name(_0: number, _1: EmbindString): number;
  dwg_obj_table_get_name(_0: number): string;
  dwg_ref_get_table_name(_0: number): string;
  dwg_ent_get_POINT2D(_0: number, _1: EmbindString): dwg_point_2d | null;
  dwg_ent_set_POINT2D(_0: number, _1: EmbindString, _2: dwg_point_2d | null): boolean;
  dwg_ent_get_POINT3D(_0: number, _1: EmbindString): dwg_point_3d | null;
  dwg_ent_set_POINT3D(_0: number, _1: EmbindString, _2: dwg_point_3d | null): boolean;
  dwg_ent_get_STRING(_0: number, _1: EmbindString): string;
  dwg_ent_set_STRING(_0: number, _1: EmbindString, _2: EmbindString): boolean;
  dwg_ent_get_UTF8(_0: number, _1: EmbindString): string;
  dwg_ent_set_UTF8(_0: number, _1: EmbindString, _2: EmbindString): boolean;
  dwg_ent_get_REAL(_0: number, _1: EmbindString): number;
  dwg_ent_set_REAL(_0: number, _1: EmbindString, _2: number): boolean;
  dwg_ent_get_INT16(_0: number, _1: EmbindString): number;
  dwg_ent_set_INT16(_0: number, _1: EmbindString, _2: number): boolean;
  dwg_ent_get_INT32(_0: number, _1: EmbindString): number;
  dwg_ent_set_INT32(_0: number, _1: EmbindString, _2: number): boolean;
  dwg_handle(_0: number): any;
  dwg_object_ref(_0: number): any;
  dwg_ptr_to_object_ref_array(_0: number, _1: number): any;
  dwg_ptr_to_object_ref_ptr_array(_0: number, _1: number): any;
  dwg_ptr_to_wchar_string_array(_0: number, _1: number): any;
  dwg_ptr_to_unsigned_char_array(_0: number, _1: number): any;
  dwg_ptr_to_signed_char_array(_0: number, _1: number): any;
  dwg_ptr_to_uint16_t_array(_0: number, _1: number): any;
  dwg_ptr_to_int16_t_array(_0: number, _1: number): any;
  dwg_ptr_to_uint32_t_array(_0: number, _1: number): any;
  dwg_ptr_to_int32_t_array(_0: number, _1: number): any;
  dwg_ptr_to_uint64_t_array(_0: number, _1: number): any;
  dwg_ptr_to_int64_t_array(_0: number, _1: number): any;
  dwg_ptr_to_double_array(_0: number, _1: number): any;
  dwg_ptr_to_point2d_array(_0: number, _1: number): any;
  dwg_ptr_to_point3d_array(_0: number, _1: number): any;
  dwg_ptr_to_point4d_array(_0: number, _1: number): any;
  dwg_ptr_to_ltype_dash_array(_0: number, _1: number): any;
  dwg_ptr_to_table_cell_array(_0: number, _1: number): any;
  dwg_ptr_to_hatch_defline_array(_0: number, _1: number): any;
  dwg_ptr_to_hatch_path_array(_0: number, _1: number): any;
  dwg_ptr_to_hatch_gradient_color_array(_0: number, _1: number): any;
  dwg_ptr_to_mline_vertex_array(_0: number, _1: number): any;
  dwg_object_get_name(_0: number): any;
  dwg_object_get_handle_object(_0: number): any;
  dwg_object_object_get_ownerhandle_object(_0: number): any;
  dwg_object_object_get_handle_object(_0: number): any;
  dwg_object_entity_get_ownerhandle_object(_0: number): any;
  dwg_object_entity_get_xdicobjhandle_object(_0: number): any;
  dwg_object_entity_get_handle_object(_0: number): any;
  dwg_object_entity_get_layer_object_ref(_0: number): any;
  dwg_object_entity_get_ltype_object_ref(_0: number): any;
  dwg_object_entity_get_color_object(_0: number): any;
  dwg_object_entity_get_xdata(_0: number): any;
  dwg_object_object_get_xdicobjhandle_object(_0: number): any;
  dwg_object_xrecord_get_xdata(_0: number): any;
  dwg_ref_get_handle_object(_0: number): any;
  dwg_dynapi_header_value(_0: number, _1: EmbindString): any;
  dwg_dynapi_entity_value(_0: number, _1: EmbindString): any;
  dwg_dynapi_common_value(_0: number, _1: EmbindString): any;
  dwg_dynapi_subclass_value(_0: number, _1: EmbindString, _2: EmbindString): any;
  dwg_entity_polyline_2d_get_numpoints(_0: number): any;
  dwg_entity_polyline_2d_get_points(_0: number): any;
  dwg_entity_polyline_2d_get_vertices(_0: number): any;
  dwg_entity_polyline_3d_get_numpoints(_0: number): any;
  dwg_entity_polyline_3d_get_points(_0: number): any;
  dwg_entity_polyline_3d_get_vertices(_0: number): any;
  dwg_entity_block_header_get_preview(_0: number): any;
  dwg_entity_get_preview(_0: number): any;
  dwg_entity_proxy_entity_get_entity_data(_0: number): any;
  dwg_entity_ole2frame_get_data(_0: number): any;
  dwg_entity_oleframe_get_data(_0: number): any;
  dwg_entity_insert_get_attribs(_0: number): any;
  dwg_object_dictionary_get_texts(_0: number): any;
  dwg_read_file(_0: EmbindString): any;
  dwg_bmp(_0: number): any;
  dwg_get_class(_0: number, _1: number): any;
}

export type MainModule = WasmModule & typeof RuntimeExports & EmbindModule;
export default function MainModuleFactory (options?: unknown): Promise<MainModule>;
