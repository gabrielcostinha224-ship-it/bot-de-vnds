const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Registro de comandos profissional
async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('config-venda')
            .setDescription('Cria um painel de vendas personalizado neste canal')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
    } catch (error) {
        console.error('Erro nos comandos:', error);
    }
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        // Abre o formulário para configurar o produto (Igual à sua imagem)
        if (i.isChatInputCommand() && i.commandName === 'config-venda') {
            const modal = new ModalBuilder().setCustomId('modal_venda').setTitle('Configurar Produto Sirius');
            
            const titulo = new TextInputBuilder().setCustomId('titulo').setLabel('Nome do Produto').setStyle(TextInputStyle.Short).setRequired(true);
            const desc = new TextInputBuilder().setCustomId('desc').setLabel('Descrição e Siglas').setStyle(TextInputStyle.Paragraph).setRequired(true);
            const preco = new TextInputBuilder().setCustomId('preco').setLabel('Preço (ex: 9.99)').setStyle(TextInputStyle.Short).setRequired(true);
            const banner = new TextInputBuilder().setCustomId('banner').setLabel('URL da Imagem/Banner').setStyle(TextInputStyle.Short).setRequired(true);
            const estoque = new TextInputBuilder().setCustomId('estoque').setLabel('Quantidade em Estoque').setStyle(TextInputStyle.Short).setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titulo),
                new ActionRowBuilder().addComponents(desc),
                new ActionRowBuilder().addComponents(preco),
                new ActionRowBuilder().addComponents(banner),
                new ActionRowBuilder().addComponents(estoque)
            );
            return await i.showModal(modal);
        }

        // Recebe os dados e cria o painel bonito
        if (i.isModalSubmit() && i.customId === 'modal_venda') {
            const [t, d, p, b, e] = ['titulo', 'desc', 'preco', 'banner', 'estoque'].map(f => i.fields.getTextInputValue(f));

            const embed = new EmbedBuilder()
                .setTitle(t)
                .setDescription(d)
                .setImage(b)
                .setColor("#00ff6a")
                .addFields(
                    { name: '💰 Preço', value: `R$ ${p}`, inline: true },
                    { name: '📦 Estoque', value: `${e} unidades`, inline: true }
                )
                .setFooter({ text: "Clique no botão abaixo para comprar" });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`compra_${t}_${p}`).setLabel('Ver Opções').setStyle(ButtonStyle.Success)
            );

            await i.channel.send({ embeds: [embed], components: [row] });
            return i.reply({ content: "✅ Painel de vendas criado!", ephemeral: true });
        }

        // Lógica do Carrinho (Segunda imagem do exemplo)
        if (i.isButton() && i.customId.startsWith('compra_')) {
            const [_, prod, valor] = i.customId.split('_');
            
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel] }
                ]
            });

            const embedCarrinho = new EmbedBuilder()
                .setTitle("Revisão do Pedido")
                .setDescription(`**Produto:** ${prod}\n**Valor:** R$ ${valor}\n\nEscolha uma opção abaixo:`)
                .setThumbnail(i.message.embeds[0].image.url)
                .setColor("#5865F2");

            const botoes = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pagar').setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user}`, embeds: [embedCarrinho], components: [botoes] });
            await i.reply({ content: `✅ Carrinho aberto em ${canal}`, ephemeral: true });
        }
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/ligar-bot', async (req, res) => {
    try {
        await iniciarBot(req.body.token);
        res.send({ msg: "OK" });
    } catch (e) {
        res.send({ msg: "ERRO" });
    }
});

// A porta deve ser 0.0.0.0 para o Railway funcionar
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
