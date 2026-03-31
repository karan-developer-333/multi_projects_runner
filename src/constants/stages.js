export const PROGRESS_STAGES = {
    DETECTING: {
        stage: 'detecting',
        percent: 5,
        message: 'Detecting project configuration...'
    },
    INSTALLING: {
        stage: 'installing',
        startPercent: 10,
        endPercent: 70,
        defaultMessage: 'Setting up project environment...'
    },
    STARTING: {
        stage: 'starting',
        startPercent: 75,
        endPercent: 90,
        defaultMessage: 'Starting development server...'
    },
    TUNNEL: {
        stage: 'tunnel',
        percent: 85,
        message: 'Creating public URL...'
    },
    READY: {
        stage: 'ready',
        percent: 100,
        message: 'Project is live!'
    }
};

export const LANGUAGE_STAGES = {
    npm: { start: 25, end: 60 },
    bun: { start: 25, end: 50 },
    pip: { start: 20, end: 60 },
    cargo: { start: 30, end: 60 },
    gomod: { start: 30, end: 60 }
};
